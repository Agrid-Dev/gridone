"""The write guard through its public methods, over dicts standing in for a device."""

from __future__ import annotations

import asyncio
from unittest.mock import Mock

import pytest

from devices_manager.core.device.write_guard import Decoded, WriteGuard
from devices_manager.core.driver import (
    AttributeDriver,
    Driver,
    DriverMetadata,
    UpdateStrategy,
)
from devices_manager.types import AttributeValueType, TransportProtocols
from models.errors import WriteRejectedError
from models.write_rules import WriteReason

from ..fixtures.fake_time import fake_time


def spec(name: str, **fields: object) -> AttributeDriver:
    return AttributeDriver.model_validate(
        {
            "name": name,
            "data_type": "float",
            "read": f"GET /{name}",
            "write": f"POST /{name}",
            **fields,
        }
    )


def build_driver(*attributes: AttributeDriver) -> Driver:
    return Driver(
        metadata=DriverMetadata(id="guarded"),
        env={},
        device_config_required=[],
        transport=TransportProtocols.HTTP,
        update_strategy=UpdateStrategy(polling_enabled=False),
        attributes={attribute.name: attribute for attribute in attributes},
    )


LOCK_RULE = {
    "condition": {"op": "eq", "left": {"attribute": "lock"}, "right": 0},
    "reason": {"code": "locked"},
}


class Stores:
    """What a device keeps: the displayed values and the saved wire codes."""

    def __init__(self, driver: Driver, **values: AttributeValueType) -> None:
        self.values: dict[str, AttributeValueType | None] = dict(values)
        self.codes: dict[str, AttributeValueType | None] = {}
        self.expired = Mock()
        self.guard = WriteGuard(
            driver, self._value, self._code, on_expired=self.expired
        )

    def _value(self, name: str) -> AttributeValueType | None:
        return self.values.get(name)

    def _code(self, name: str) -> AttributeValueType | None:
        return self.codes.get(name)

    def observe(
        self, name: str, sample: AttributeValueType | None
    ) -> dict[str, Decoded]:
        results = self.guard.observed(name, sample)
        for key, decoded in results.items():
            self.values[key] = decoded.value
            self.codes[key] = decoded.code
        return results


def test_only_an_observation_makes_a_value_known():
    stores = Stores(
        build_driver(spec("lock"), spec("target", write_rules=[LOCK_RULE])), lock=0
    )
    guard = stores.guard
    assert guard.known("lock") is None  # restored, never observed
    stores.observe("lock", 0)
    assert guard.known("lock") == 0
    guard.forget("lock")
    assert guard.known("lock") is None
    assert stores.values["lock"] == 0  # display untouched
    stores.observe("lock", 0)
    guard.forget()
    assert guard.known("lock") is None


def test_mapped_attribute_resolves_from_trusted_siblings_only():
    driver = build_driver(
        spec("first", write=None),
        spec(
            "mode",
            value_mapping={"entries": [{"code": 1, "value": {"attribute": "first"}}]},
        ),
    )
    stores = Stores(driver)
    result = stores.observe("mode", 1)
    assert result["mode"] == Decoded(None, 1, WriteReason(code="unknown_dependencies"))
    assert stores.guard.known("mode") is None
    result = stores.observe("first", 5)
    assert result["mode"] == Decoded(5.0, 1)
    assert stores.guard.known("mode") == 5.0
    assert stores.observe("first", 6)["mode"].value == 6.0
    stores.guard.forget("first")
    assert stores.guard.known("mode") is None
    assert stores.values["mode"] == 6.0  # trust loss never touches display
    assert stores.codes["mode"] == 1
    stores.observe("first", 6)
    assert stores.guard.known("mode") == 6.0


@pytest.mark.parametrize(
    ("data_type", "sibling", "code", "error"),
    [
        ("float", 5, 7, "invalid_mapping_code"),
        ("int", 22.5, 1, "invalid_mapping_value"),
    ],
)
def test_unresolvable_codes_keep_their_reason(data_type, sibling, code, error):
    driver = build_driver(
        spec("first", write=None),
        spec(
            "mode",
            data_type=data_type,
            value_mapping={"entries": [{"code": 1, "value": {"attribute": "first"}}]},
        ),
    )
    stores = Stores(driver)
    stores.observe("first", sibling)
    assert stores.observe("mode", code)["mode"] == Decoded(
        None, code, WriteReason(code=error)
    )


def test_dependent_chains_reinterpret_in_dependency_order():
    driver = build_driver(
        spec("a", write=None),
        spec(
            "m1", value_mapping={"entries": [{"code": 1, "value": {"attribute": "a"}}]}
        ),
        spec(
            "m2", value_mapping={"entries": [{"code": 1, "value": {"attribute": "m1"}}]}
        ),
    )
    stores = Stores(driver)
    stores.observe("m2", 1)
    stores.observe("m1", 1)
    result = stores.observe("a", 3)
    assert list(result) == ["a", "m1", "m2"]
    assert (result["m1"].value, result["m2"].value) == (3.0, 3.0)
    assert stores.guard.known("m2") == 3.0
    # An untrusted link in the chain breaks it, even with a fresh sibling value.
    stores.guard.forget("m1")
    assert stores.observe("a", 4)["m2"] == Decoded(
        None, 1, WriteReason(code="unknown_dependencies")
    )


def test_project_returns_changes_and_moves_the_revision_once():
    driver = build_driver(spec("lock"), spec("target", write_rules=[LOCK_RULE]))
    stores = Stores(driver)
    guard = stores.guard
    first = guard.project()
    assert set(first) == {"lock", "target"}
    assert first["target"].status == "unknown"
    revision = guard.revision
    assert guard.project() == {}
    assert guard.revision == revision
    assert guard.announce()
    assert not guard.announce()
    stores.observe("lock", 0)
    changed = guard.project()
    assert list(changed) == ["target"]
    assert changed["target"].status == "ready"
    assert guard.revision == revision + 1
    assert guard.state("target") is changed["target"]
    assert guard.announce()


def test_raw_code_change_alone_moves_the_revision():
    driver = build_driver(
        spec("mode", value_mapping={"entries": [{"code": 1, "value": 22}]})
    )
    stores = Stores(driver)
    stores.guard.project()
    stores.observe("mode", 7)
    revision = stores.guard.revision
    stores.guard.project()
    assert stores.guard.revision == revision + 1
    stores.observe("mode", 8)
    assert stores.guard.project() == {}  # same write state, new raw code
    assert stores.guard.revision == revision + 2


def test_evaluate_and_check_read_the_contract_and_trusted_values():
    driver = build_driver(
        spec("lock"),
        spec("sensor", write=None),
        spec("count", data_type="int"),
        spec("target", write_rules=[LOCK_RULE]),
    )
    stores = Stores(driver)
    guard = stores.guard
    assert guard.evaluate("missing", 1).reasons[0].code == "not_writable"
    assert guard.evaluate("sensor", 1).reasons[0].code == "not_writable"
    assert guard.evaluate("count", 2.5).reasons[0].code == "invalid_value"
    assert guard.evaluate("target", "abc").reasons[0].code == "invalid_value"
    assert guard.evaluate("target", 22).reasons[0].code == "locked"
    stores.observe("lock", 0)
    assert guard.check("target", "22") == 22.0
    stores.observe("lock", 1)
    with pytest.raises(WriteRejectedError) as rejected:
        guard.check("target", 22)
    assert rejected.value.reasons[0].code == "locked"


def test_encode_and_mapping_context_follow_trusted_values():
    driver = build_driver(
        spec("first", write=None),
        spec(
            "mode",
            value_mapping={"entries": [{"code": 1, "value": {"attribute": "first"}}]},
        ),
    )
    stores = Stores(driver)
    guard = stores.guard
    assert guard.mapping_context("mode") == {"first": None}
    assert guard.mapping_context("first") == {}
    with pytest.raises(WriteRejectedError):
        guard.encode("mode", 5)
    stores.observe("first", 5)
    assert guard.mapping_context("mode") == {"first": 5.0}
    assert guard.encode("mode", 5) == 1
    assert guard.encode("first", 5) == 5


def test_rename_keeps_trust_and_rebind_prunes_vanished_names():
    driver = build_driver(spec("lock"), spec("other"))
    stores = Stores(driver)
    stores.observe("lock", 0)
    stores.observe("other", 1)
    driver.attributes["latch"] = driver.attributes.pop("lock").model_copy(
        update={"name": "latch"}
    )
    stores.values["latch"] = stores.values.pop("lock")
    stores.guard.rename("lock", "latch")
    assert stores.guard.known("latch") == 0
    assert stores.guard.known("other") == 1
    del driver.attributes["other"]
    stores.guard.rebind(driver)
    assert stores.guard.known("other") is None
    assert set(stores.guard.project()) == {"latch"}


@fake_time
@pytest.mark.asyncio
async def test_watch_bounds_trust_to_one_interval_and_close_drops_it():
    stores = Stores(build_driver(spec("lock")))
    guard = stores.guard
    guard.watch(60)
    stores.observe("lock", 0)
    await asyncio.sleep(59)
    assert guard.known("lock") == 0
    await asyncio.sleep(2)
    assert guard.known("lock") is None
    stores.expired.assert_called_once_with()
    stores.observe("lock", 0)
    assert guard.known("lock") == 0
    guard.close()
    assert guard.known("lock") is None
    await asyncio.sleep(61)
    stores.expired.assert_called_once_with()


def test_operating_rule_age_limits_do_not_inherit_driver_expiry(monkeypatch):
    from types import SimpleNamespace

    from devices_manager.core.device import write_guard

    now = [0.0]
    monkeypatch.setattr(
        write_guard,
        "time",
        SimpleNamespace(monotonic=lambda: now[0], time_ns=lambda: 0),
    )
    driver = build_driver(spec("value"))
    driver.update_strategy.polling_enabled = True
    stores = Stores(driver, value=7)
    guard = stores.guard
    assert guard.observed_value("value") is None
    assert guard.observed_value("missing") is None
    stores.observe("value", 7)
    now[0] = 30
    assert guard.known("value") is None
    assert guard.observed_value("value", max_age_seconds=30) is None
    assert guard.observed_value("value", max_age_seconds=60) == 7
    assert guard.observed_value("value") == 7
    guard.close()
    assert guard.observed_value("value") is None


def test_mapped_operating_rule_observations_follow_the_same_age_limit(monkeypatch):
    from types import SimpleNamespace

    from devices_manager.core.device import write_guard

    now = [0.0]
    monkeypatch.setattr(
        write_guard,
        "time",
        SimpleNamespace(monotonic=lambda: now[0], time_ns=lambda: 0),
    )
    driver = build_driver(
        spec("source"),
        spec(
            "mapped",
            value_mapping={
                "entries": [
                    {
                        "code": 1,
                        "value": {
                            "op": "add",
                            "args": [{"attribute": "source"}, {"attribute": "source"}],
                        },
                    }
                ]
            },
        ),
    )
    driver.update_strategy.polling_enabled = True
    stores = Stores(driver)
    stores.observe("source", 4)
    now[0] = 100
    stores.observe("mapped", 1)
    assert stores.guard.known("mapped") is None
    assert stores.guard.observed_value("mapped", max_age_seconds=30) is None
    assert stores.guard.observed_value("mapped", max_age_seconds=120) == 8
    assert stores.guard.observed_value("mapped") == 8
    stores.guard.forget("source")
    assert stores.guard.observed_value("mapped") is None
    stores.observe("source", 5)
    assert stores.guard.observed_value("mapped") == 10
    now[0] = 130
    stores.observe("source", 5)
    assert stores.guard.observed_value("mapped", max_age_seconds=30) is None
    assert stores.guard.observed_value("mapped") == 10
    monkeypatch.setattr(write_guard, "MAX_DEVICE_OPERATIONS", 0)
    assert stores.guard.observed_value("mapped") is None


@pytest.mark.asyncio
@fake_time
async def test_push_expiry_does_not_expire_unbounded_operating_rules():
    stores = Stores(build_driver(spec("value")))
    stores.guard.watch(1)
    stores.observe("value", 7)
    await asyncio.sleep(1.1)
    assert stores.guard.known("value") is None
    assert stores.guard.observed_value("value") == 7
    stores.guard.close()
    assert stores.guard.observed_value("value") is None

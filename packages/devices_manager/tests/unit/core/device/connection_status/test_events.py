from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest

from devices_manager.core.device.attribute import Attribute
from devices_manager.core.device.connection_status.events import (
    AttributeEventLog,
    EventType,
    log_event,
    wrap_listen,
)
from devices_manager.types import DataType


def _make_attribute(name: str = "temperature") -> Attribute:
    return Attribute.create(name, DataType.FLOAT, {"read", "write"})


class _Host:
    """Minimal `log_event` host: exposes its attributes and records events."""

    def __init__(self, attribute: Attribute) -> None:
        self.attributes = {attribute.name: attribute}
        self.recorded: list[tuple[str, AttributeEventLog]] = []

    def record_event(self, attribute: Attribute, entry: AttributeEventLog) -> None:
        self.recorded.append((attribute.name, entry))


@pytest.mark.asyncio
class TestLogEventDecorator:
    async def test_ok_records_ok_entry(self) -> None:
        host = _Host(_make_attribute())

        @log_event(EventType.READ)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> str:
            return "value"

        await fn(host, "temperature")

        [(name, entry)] = host.recorded
        assert name == "temperature"
        assert entry.status == "ok"
        assert entry.event_type == EventType.READ
        assert entry.message is None

    async def test_exception_records_error_entry_and_reraises(self) -> None:
        host = _Host(_make_attribute())

        @log_event(EventType.WRITE)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> None:
            raise OSError("boom")

        with pytest.raises(OSError, match="boom"):
            await fn(host, "temperature")

        [(_, entry)] = host.recorded
        assert entry.status == "error"
        assert entry.event_type == EventType.WRITE
        assert entry.message == "boom"

    async def test_unknown_attribute_falls_through_without_logging(self) -> None:
        host = _Host(_make_attribute())
        called = []

        @log_event(EventType.READ)
        async def fn(_self: object, attribute_name: str) -> None:
            called.append(attribute_name)

        await fn(host, "nonexistent")

        assert called == ["nonexistent"]
        assert host.recorded == []


@pytest.mark.asyncio
class TestObservabilityLog:
    async def test_decorator_no_longer_emits_duration_observability_log(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        # Read-latency timing moved to the transport I/O boundary (``timed_io``),
        # so the decorator only maintains event-log history and emits no
        # ``devices_manager.observability`` duration line of its own.
        host = _Host(_make_attribute())

        @log_event(EventType.READ)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> str:
            return "value"

        with caplog.at_level(logging.INFO, logger="devices_manager.observability"):
            await fn(host, "temperature")

        assert caplog.records == []


class TestWrapListen:
    def test_successful_listen_records_ok_and_feeds_on_data(self) -> None:
        recorded: list[AttributeEventLog] = []
        on_data = MagicMock()

        wrapped = wrap_listen(lambda _: None, recorded.append, on_data=on_data)
        wrapped("payload")

        [entry] = recorded
        assert entry.status == "ok"
        assert entry.event_type == EventType.LISTEN
        assert entry.message is None
        on_data.assert_called_once()

    def test_callback_failure_records_error_and_reraises(self) -> None:
        recorded: list[AttributeEventLog] = []

        def bad_callback(_: object) -> None:
            raise RuntimeError("apply failed")  # noqa: TRY003

        on_data = MagicMock()
        wrapped = wrap_listen(bad_callback, recorded.append, on_data=on_data)

        with pytest.raises(RuntimeError, match="apply failed"):
            wrapped("payload")

        [entry] = recorded
        assert entry.status == "error"
        on_data.assert_not_called()


class TestAttributeEventLogFactories:
    def test_ok_builds_an_ok_entry(self) -> None:
        entry = AttributeEventLog.ok(EventType.READ)
        assert (entry.event_type, entry.status, entry.message) == (
            EventType.READ,
            "ok",
            None,
        )

    def test_error_keeps_the_exception_message(self) -> None:
        entry = AttributeEventLog.error(EventType.WRITE, RuntimeError("boom"))
        assert (entry.event_type, entry.status, entry.message) == (
            EventType.WRITE,
            "error",
            "boom",
        )

    @pytest.mark.parametrize(
        ("error", "status"), [(None, "ok"), (RuntimeError("boom"), "error")]
    )
    def test_new_picks_ok_or_error(self, error: Exception | None, status: str) -> None:
        assert AttributeEventLog.new(EventType.LISTEN, error).status == status

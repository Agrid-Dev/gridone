from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from devices_manager.core.device.attribute import Attribute
from devices_manager.core.device.event_log import (
    EventType,
    log_event,
    wrap_listen,
)
from devices_manager.types import DataType

pytestmark = pytest.mark.asyncio


def _make_attribute(name: str = "temperature") -> Attribute:
    return Attribute.create(name, DataType.FLOAT, {"read", "write"})


def _make_host(attribute: Attribute | None = None) -> MagicMock:
    host = MagicMock()
    host.attributes = {"temperature": attribute} if attribute is not None else {}
    return host


class TestLogEventDecorator:
    async def test_ok_appends_ok_entry(self) -> None:
        attr = _make_attribute()
        host = _make_host(attr)

        @log_event(EventType.READ)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> str:
            return "value"

        await fn(host, "temperature")

        assert len(attr.logs.read) == 1
        assert attr.logs.read[0].status == "ok"
        assert attr.logs.read[0].event_type == EventType.READ

    async def test_exception_appends_error_entry_and_reraises(self) -> None:
        attr = _make_attribute()
        host = _make_host(attr)

        @log_event(EventType.WRITE)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> None:
            raise OSError("boom")

        with pytest.raises(OSError, match="boom"):
            await fn(host, "temperature")

        assert len(attr.logs.write) == 1
        assert attr.logs.write[0].status == "error"
        assert attr.logs.write[0].event_type == EventType.WRITE
        assert "boom" in attr.logs.write[0].message  # type: ignore[arg-type]

    async def test_unknown_attribute_falls_through_without_logging(self) -> None:
        attr = _make_attribute()
        host = _make_host(attr)
        called = []

        @log_event(EventType.READ)
        async def fn(_self: object, attribute_name: str) -> None:
            called.append(attribute_name)

        await fn(host, "nonexistent")

        assert called == ["nonexistent"]
        assert len(attr.logs.read) == 0

    async def test_ok_entry_has_no_message(self) -> None:
        attr = _make_attribute()
        host = _make_host(attr)

        @log_event(EventType.READ)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> None:
            pass

        await fn(host, "temperature")

        assert attr.logs.read[0].message is None

    async def test_error_entry_captures_exception_message(self) -> None:
        attr = _make_attribute()
        host = _make_host(attr)

        @log_event(EventType.READ)
        async def fn(_self: object, _attribute_name: str, **_kwargs: object) -> None:
            raise OSError("bad value")  # noqa: TRY003

        with pytest.raises(OSError, match="bad value"):
            await fn(host, "temperature")

        assert attr.logs.read[0].message == "bad value"


class TestWrapListen:
    def test_ok_appends_ok_entry(self) -> None:
        attr = _make_attribute()

        wrapped = wrap_listen(lambda _: None, attr)
        wrapped("payload")

        assert len(attr.logs.listen) == 1
        assert attr.logs.listen[0].status == "ok"
        assert attr.logs.listen[0].event_type == EventType.LISTEN

    def test_callback_failure_logs_error_and_reraises(self) -> None:
        attr = _make_attribute()

        def bad_callback(_: object) -> None:
            raise RuntimeError("apply failed")  # noqa: TRY003

        on_data = MagicMock()
        wrapped = wrap_listen(bad_callback, attr, on_data=on_data)

        with pytest.raises(RuntimeError, match="apply failed"):
            wrapped("payload")

        assert len(attr.logs.listen) == 1
        assert attr.logs.listen[0].status == "error"
        on_data.assert_not_called()

    def test_ok_entry_has_no_message(self) -> None:
        attr = _make_attribute()

        wrapped = wrap_listen(lambda _: None, attr)
        wrapped("payload")

        assert attr.logs.listen[0].message is None

    def test_successful_listen_logs_ok_and_feeds_on_data(self) -> None:
        attr = _make_attribute()
        on_data = MagicMock()

        wrapped = wrap_listen(lambda _: None, attr, on_data=on_data)
        wrapped("payload")

        assert len(attr.logs.listen) == 1
        assert attr.logs.listen[0].status == "ok"
        on_data.assert_called_once()

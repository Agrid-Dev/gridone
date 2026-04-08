"""KNX/IP tunnel client. Payload shape is defined in ``wire_payload``."""

import logging
from typing import cast

from xknx import XKNX
from xknx.core import ValueReader
from xknx.telegram import GroupAddress, Telegram
from xknx.telegram.apci import GroupValueResponse, GroupValueWrite

from devices_manager.core.transports import PushTransportClient
from devices_manager.core.transports.connected import connected
from devices_manager.core.transports.listener_registry import ListenerCallback
from devices_manager.core.transports.transport_connection_state import (
    TransportConnectionState,
)
from devices_manager.types import AttributeValueType, TransportProtocols

from .knx_address import KNXAddress
from .transport_config import KNXTransportConfig
from .wire_payload import apci_payload_to_raw, raw_to_group_value_write

logger = logging.getLogger(__name__)

READ_TIMEOUT_SECONDS = 5.0


class KNXTransportClient(PushTransportClient[KNXAddress]):
    _config_builder = KNXTransportConfig
    protocol = TransportProtocols.KNX
    address_builder = KNXAddress
    config: KNXTransportConfig
    _xknx_instance: XKNX | None = None

    @property
    def _xknx(self) -> XKNX:
        if self._xknx_instance is None:
            msg = "KNX client is not connected"
            raise RuntimeError(msg)
        return self._xknx_instance

    def _on_telegram_received(self, telegram: Telegram) -> None:
        if not isinstance(telegram.payload, (GroupValueResponse, GroupValueWrite)):
            return
        address_id = str(telegram.destination_address)
        raw = apci_payload_to_raw(telegram.payload)
        for callback in self._handlers_registry.get_by_address_id(address_id):
            try:
                callback(raw)
            except Exception:  # noqa: BLE001
                logger.debug("KNX listener callback failed", exc_info=True)

    async def connect(self) -> None:
        async with self._connection_lock:
            if self.connection_state.is_connected:
                return
            self._xknx_instance = XKNX(
                connection_config=self.config.to_xknx_connection_config(),
                telegram_received_cb=self._on_telegram_received,
            )
            try:
                await self._xknx_instance.start()
            except Exception:
                self._xknx_instance = None
                self.connection_state = TransportConnectionState.connection_error()
                raise
            await super().connect()

    async def close(self) -> None:
        async with self._connection_lock:
            if not self.connection_state.is_connected:
                return
            if self._xknx_instance is not None:
                await self._xknx_instance.stop()
                self._xknx_instance = None
            await super().close()

    async def register_listener(self, topic: str, callback: ListenerCallback) -> str:
        return self._handlers_registry.register(topic, callback)

    async def unregister_listener(
        self, callback_id: str, topic: str | None = None
    ) -> None:
        self._handlers_registry.remove(callback_id, topic)

    @connected
    async def read(self, address: KNXAddress) -> AttributeValueType:
        """Send GroupValueRead and await GroupValueResponse via xknx ValueReader.

        Returns the raw wire value (bool, int, or list[int] for multi-byte DPTs).
        Multi-byte values (list[int]) require a knx_dpt value adapter to convert
        to a valid AttributeValueType before use.
        """
        reader = ValueReader(
            self._xknx,
            GroupAddress(address.topic),
            timeout_in_seconds=READ_TIMEOUT_SECONDS,
        )
        telegram = await reader.read()
        if telegram is None:
            msg = "KNX: no response received before timeout"
            raise TimeoutError(msg)
        payload = cast("GroupValueResponse | GroupValueWrite", telegram.payload)
        return apci_payload_to_raw(payload)  # ty: ignore[invalid-return-type]

    @connected
    async def write(self, address: KNXAddress, value: AttributeValueType) -> None:
        telegram = Telegram(
            destination_address=GroupAddress(address.topic),
            payload=raw_to_group_value_write(value),
        )
        await self._xknx.telegrams.put(telegram)

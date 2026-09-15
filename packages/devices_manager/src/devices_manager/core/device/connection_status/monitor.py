from __future__ import annotations

import asyncio
import logging
from collections import Counter, deque
from contextlib import contextmanager
from typing import TYPE_CHECKING, Final

from devices_manager.types import ConnectionStatus

from .events import AttributeEventLog, AttributeLogs, EventType

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

logger = logging.getLogger(__name__)

LOG_SIZE: Final = 10
SILENCE_DEGRADED_MULTIPLIER: Final = 2
SILENCE_ERROR_MULTIPLIER: Final = 3

_SEVERITY: Final = {
    ConnectionStatus.IDLE: 0,
    ConnectionStatus.OK: 1,
    ConnectionStatus.DEGRADED: 2,
    ConnectionStatus.ERROR: 3,
}


class _Log:
    """One bounded log, newest entry first, with its error count kept in step."""

    def __init__(self) -> None:
        self.entries: deque[AttributeEventLog] = deque(maxlen=LOG_SIZE)
        self.errors = 0

    def append(self, entry: AttributeEventLog) -> None:
        """Add ``entry`` and adjust the error count in O(1).

        Once the deque holds ``LOG_SIZE`` entries, ``appendleft`` silently
        drops the oldest one (the rightmost), so its status is subtracted
        before it goes.
        """
        if len(self.entries) == LOG_SIZE and self.entries[-1].status == "error":
            self.errors -= 1
        self.entries.appendleft(entry)
        if entry.status == "error":
            self.errors += 1


def _attribute_status(
    logs: dict[EventType, _Log], max_attribute_loss: float
) -> ConnectionStatus:
    """Judge an attribute by the loss of its worse reachability log.

    Read and listen logs are not pooled: a failed poll adds a read error but
    no listen entry, so pooling would dilute the read loss with unrelated
    listen successes. Total loss is an error whatever the tolerance.
    """
    read, listen = logs[EventType.READ], logs[EventType.LISTEN]
    loss = max(
        read.errors / len(read.entries) if read.entries else 0.0,
        listen.errors / len(listen.entries) if listen.entries else 0.0,
    )
    if loss == 1:
        return ConnectionStatus.ERROR
    if loss > max_attribute_loss:
        return ConnectionStatus.DEGRADED
    return ConnectionStatus.OK


class ConnectionMonitor:
    """Monitors a device's connection from its attributes' outcomes and from
    push silence, and publishes the resulting connection status.

    Every read, write and listen outcome is kept in a bounded per-attribute
    log. Reads and listens also give their attribute a status from the share
    of failures in its worse log (its loss); the monitor only counts
    attributes per status, so recording costs O(1) whatever the attribute
    count:

    - ``idle``: no read or listen outcome yet
    - ``error``: every attribute with outcomes is at total loss
    - ``degraded``: at least one attribute loses more than
      ``max_attribute_loss``, or all of its outcomes
    - ``ok``: every attribute is within tolerance

    With a ``silence_interval``, ``watch`` starts silence detection: after 2
    intervals without data the device is degraded, after 3 in error. A silence
    worse than the outcomes wins until data is received again. ``close``
    stops it; a monitor lives for one synchronisation of its device.

    ``publish`` is called with the new status whenever it changes, never
    with ``idle``, so a status restored from storage is kept until the first
    outcome.
    """

    def __init__(
        self,
        publish: Callable[[ConnectionStatus], None],
        *,
        silence_interval: float | None = None,
        max_attribute_loss: float = 0.0,
    ) -> None:
        self._publish = publish
        self._max_attribute_loss = max_attribute_loss
        self._silence_interval = silence_interval
        self._logs: dict[str, dict[EventType, _Log]] = {}
        self._attribute_statuses: dict[str, ConnectionStatus] = {}
        self._status_counts: Counter[ConnectionStatus] = Counter()
        self._watching = False
        self._silence: ConnectionStatus | None = None
        self._silence_timer: asyncio.TimerHandle | None = None
        self._published: ConnectionStatus | None = None

    def record(
        self,
        event_type: EventType,
        attribute: str,
        error: Exception | None = None,
    ) -> None:
        """Record one outcome: ``error`` is the failure, ``None`` a success."""
        logs = self._logs.get(attribute)
        if logs is None:
            logs = self._logs[attribute] = {t: _Log() for t in EventType}
        logs[event_type].append(AttributeEventLog.new(event_type, error))
        if event_type is EventType.WRITE:
            return
        if event_type is EventType.LISTEN and error is None:
            self._data_received()
        self._set_attribute_status(
            attribute, _attribute_status(logs, self._max_attribute_loss)
        )
        self._publish_status()

    @contextmanager
    def observe(self, event_type: EventType, attribute: str) -> Iterator[None]:
        """Record the outcome of the block: an exception is recorded, then
        re-raised."""
        try:
            yield
        except Exception as e:
            self.record(event_type, attribute, e)
            raise
        self.record(event_type, attribute)

    def logs(self, attribute: str) -> AttributeLogs:
        logs = self._logs.get(attribute)
        return AttributeLogs(
            **{
                t.value: list(logs[t].entries) if logs is not None else []
                for t in EventType
            }
        )

    def forget(self, attribute: str) -> None:
        if self._logs.pop(attribute, None) is not None:
            self._set_attribute_status(attribute, None)
            self._publish_status()

    def rename(self, old_name: str, new_name: str) -> None:
        """Move an attribute's logs and status to ``new_name``, replacing
        whatever ``new_name`` held."""
        logs = self._logs.pop(old_name, None)
        if logs is None:
            return
        status = self._attribute_statuses.get(old_name)
        self._set_attribute_status(old_name, None)
        self._logs[new_name] = logs
        self._set_attribute_status(new_name, status)
        self._publish_status()

    def watch(self) -> None:
        """Start silence detection, when a silence interval is set.

        Needs a running event loop. Idempotent.
        """
        if self._silence_interval is None or self._watching:
            return
        self._watching = True
        self._arm_silence(self._silence_interval)

    def close(self) -> None:
        """Stop silence detection. Idempotent."""
        self._watching = False
        self._cancel_silence_timer()
        self._silence = None

    @property
    def status(self) -> ConnectionStatus:
        from_outcomes = self._status_from_outcomes()
        if self._silence is None:
            return from_outcomes
        return max(from_outcomes, self._silence, key=_SEVERITY.__getitem__)

    def _status_from_outcomes(self) -> ConnectionStatus:
        errored = self._status_counts[ConnectionStatus.ERROR]
        failing = errored + self._status_counts[ConnectionStatus.DEGRADED]
        tracked = failing + self._status_counts[ConnectionStatus.OK]
        if tracked == 0:
            return ConnectionStatus.IDLE
        if errored == tracked:
            return ConnectionStatus.ERROR
        if failing > 0:
            return ConnectionStatus.DEGRADED
        return ConnectionStatus.OK

    def _set_attribute_status(
        self, attribute: str, status: ConnectionStatus | None
    ) -> None:
        previous = self._attribute_statuses.pop(attribute, None)
        if previous is not None:
            self._status_counts[previous] -= 1
        if status is not None:
            self._status_counts[status] += 1
            self._attribute_statuses[attribute] = status

    def _data_received(self) -> None:
        self._silence = None
        if self._watching and self._silence_interval is not None:
            self._arm_silence(self._silence_interval)

    def _arm_silence(self, interval: float) -> None:
        """(Re)start the silence clock: degraded after 2 intervals."""
        self._schedule_silence(
            SILENCE_DEGRADED_MULTIPLIER * interval, ConnectionStatus.DEGRADED
        )

    def _schedule_silence(self, delay: float, status: ConnectionStatus) -> None:
        self._cancel_silence_timer()
        self._silence_timer = asyncio.get_running_loop().call_later(
            delay, self._on_silence, status
        )

    def _cancel_silence_timer(self) -> None:
        if self._silence_timer is not None:
            self._silence_timer.cancel()
            self._silence_timer = None

    def _on_silence(self, status: ConnectionStatus) -> None:
        """Escalate: degraded, then error one interval later."""
        self._silence_timer = None
        self._silence = status
        if status is ConnectionStatus.DEGRADED and self._silence_interval is not None:
            self._schedule_silence(
                (SILENCE_ERROR_MULTIPLIER - SILENCE_DEGRADED_MULTIPLIER)
                * self._silence_interval,
                ConnectionStatus.ERROR,
            )
        self._publish_status()

    def _publish_status(self) -> None:
        status = self.status
        if status in (ConnectionStatus.IDLE, self._published):
            return
        self._published = status
        try:
            self._publish(status)
        except Exception:
            logger.exception("Failed to publish connection status %s", status)

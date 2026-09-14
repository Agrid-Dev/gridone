from collections import Counter
from collections.abc import Iterable
from enum import StrEnum
from typing import Final

from devices_manager.types import ConnectionStatus

from .event_journal import LogCounts


class _AttributeHealth(StrEnum):
    UNTRACKED = "untracked"
    OK = "ok"
    UNSTABLE = "unstable"
    DEAD = "dead"


_SEVERITY: Final = {
    ConnectionStatus.IDLE: 0,
    ConnectionStatus.OK: 1,
    ConnectionStatus.DEGRADED: 2,
    ConnectionStatus.ERROR: 3,
}


def _classify(logs: Iterable[LogCounts]) -> _AttributeHealth:
    """Pool the attribute's logs: all ok, all failed, or a mix of both."""
    errors = total = 0
    for counts in logs:
        errors += counts.errors
        total += counts.total
    if total == 0:
        return _AttributeHealth.UNTRACKED
    if errors == 0:
        return _AttributeHealth.OK
    if errors == total:
        return _AttributeHealth.DEAD
    return _AttributeHealth.UNSTABLE


class ConnectionHealth:
    """Derives a device's connection status from its attributes' outcomes and
    from push silence.

    Each attribute is classified from its log counts when it reports, and
    the device only keeps how many attributes sit in each class, so a report
    costs O(1) whatever the attribute count:

    - ``idle``: no attribute has outcomes yet
    - ``error``: every attribute with outcomes has only failures
    - ``degraded``: at least one attribute has a failure
    - ``ok``: no failure at all

    Silence (reported by the watchdog) overrides the logs when worse, until
    it is cleared by data coming back.
    """

    def __init__(self) -> None:
        self._classes: dict[str, _AttributeHealth] = {}
        self._counts: Counter[_AttributeHealth] = Counter()
        self._silence: ConnectionStatus | None = None

    def track(self, attribute: str, logs: Iterable[LogCounts]) -> None:
        self._move(attribute, _classify(logs))

    def forget(self, attribute: str) -> None:
        self._move(attribute, _AttributeHealth.UNTRACKED)

    def rename(self, old_name: str, new_name: str) -> None:
        health = self._classes.pop(old_name, None)
        if health is not None:
            self._classes[new_name] = health

    def report_silence(self, status: ConnectionStatus | None) -> None:
        self._silence = status

    @property
    def status(self) -> ConnectionStatus:
        from_logs = self._status_from_logs()
        if self._silence is None:
            return from_logs
        return max(from_logs, self._silence, key=_SEVERITY.__getitem__)

    def _move(self, attribute: str, health: _AttributeHealth) -> None:
        previous = self._classes.pop(attribute, _AttributeHealth.UNTRACKED)
        self._counts[previous] -= 1
        self._counts[health] += 1
        if health is not _AttributeHealth.UNTRACKED:
            self._classes[attribute] = health

    def _status_from_logs(self) -> ConnectionStatus:
        dead = self._counts[_AttributeHealth.DEAD]
        failing = dead + self._counts[_AttributeHealth.UNSTABLE]
        tracked = failing + self._counts[_AttributeHealth.OK]
        if tracked == 0:
            return ConnectionStatus.IDLE
        if dead == tracked:
            return ConnectionStatus.ERROR
        if failing > 0:
            return ConnectionStatus.DEGRADED
        return ConnectionStatus.OK

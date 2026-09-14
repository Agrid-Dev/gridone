from collections import deque
from typing import Final, NamedTuple

from .connection_status.events import AttributeEventLog, AttributeLogs, EventType

LOG_SIZE: Final = 10


class LogCounts(NamedTuple):
    errors: int
    total: int


class _Log:
    """One bounded log, newest entry first, with its error count kept in step."""

    def __init__(self) -> None:
        self.entries: deque[AttributeEventLog] = deque(maxlen=LOG_SIZE)
        self.errors = 0

    def append(self, entry: AttributeEventLog) -> None:
        """Add ``entry`` and adjust the error count in O(1).

        The deque is full once it holds ``LOG_SIZE`` entries: ``appendleft``
        then silently drops the oldest one (the rightmost), so its status is
        subtracted before it goes.
        """
        if len(self.entries) == LOG_SIZE and self.entries[-1].status == "error":
            self.errors -= 1
        self.entries.appendleft(entry)
        if entry.status == "error":
            self.errors += 1

    @property
    def counts(self) -> LogCounts:
        return LogCounts(errors=self.errors, total=len(self.entries))


_EMPTY: Final = LogCounts(errors=0, total=0)


class EventJournal:
    """Recent read, write and listen outcomes of a device's attributes.

    Each attribute keeps one bounded log per event type. Error and total
    counts are maintained on every record, so health checks never rescan
    the entries.
    """

    def __init__(self) -> None:
        self._logs: dict[str, dict[EventType, _Log]] = {}

    def record(self, attribute: str, entry: AttributeEventLog) -> None:
        logs = self._logs.setdefault(attribute, {t: _Log() for t in EventType})
        logs[entry.event_type].append(entry)

    def logs(self, attribute: str) -> AttributeLogs:
        logs = self._logs.get(attribute)
        return AttributeLogs(
            **{
                t.value: list(logs[t].entries) if logs is not None else []
                for t in EventType
            }
        )

    def counts(self, attribute: str, event_type: EventType) -> LogCounts:
        logs = self._logs.get(attribute)
        return logs[event_type].counts if logs is not None else _EMPTY

    def forget(self, attribute: str) -> None:
        self._logs.pop(attribute, None)

    def rename(self, old_name: str, new_name: str) -> None:
        logs = self._logs.pop(old_name, None)
        if logs is not None:
            self._logs[new_name] = logs

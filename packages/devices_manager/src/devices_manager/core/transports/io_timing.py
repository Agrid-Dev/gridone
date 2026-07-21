import logging
from asyncio import CancelledError
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from time import perf_counter

from devices_manager.types import TransportProtocols

IO_LOGGER_NAME = "devices_manager.transport_io"
_io_logger = logging.getLogger(IO_LOGGER_NAME)


@asynccontextmanager
async def timed_io(
    transport_id: str,
    protocol: TransportProtocols,
    addresses: int,
) -> AsyncGenerator[None]:
    """Time one transport transaction and emit its I/O-cost metric.

    Wraps a strategy's actual wire call: base single reads pass ``addresses=1``,
    a batch strategy passes how many addresses its one round-trip served, so the
    metric distinguishes a coalesced block from several single reads.
    """
    start = perf_counter()
    status = "ok"
    cancelled = False
    try:
        yield
    except CancelledError:
        # An aborted transaction produced no measurement: emit nothing rather
        # than a bogus ok/error metric with a truncated duration.
        cancelled = True
        raise
    except Exception:
        status = "error"
        raise
    finally:
        if not cancelled:
            _io_logger.info(
                "transport read",
                extra={
                    "transport": transport_id,
                    "protocol": protocol,
                    "addresses": addresses,
                    "status": status,
                    "duration_ms": (perf_counter() - start) * 1000,
                },
            )

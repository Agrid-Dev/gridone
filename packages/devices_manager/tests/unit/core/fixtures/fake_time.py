import pytest

# Fast-forwarded loop time: an hour of polling runs in milliseconds.
#
# looptime advances its integer clock by ``round(timeout / resolution)``, so a
# timer less than half a tick away is never reached and the loop spins. asyncio
# fires timers within ``clock_resolution`` (1 ns on Linux, ~42 ns on macOS) of
# their deadline, so a 1 ns tick always lands close enough. Sweep slots have
# arbitrary float phases, which the default 1 µs tick would round past.
fake_time = pytest.mark.looptime(resolution=1e-9)

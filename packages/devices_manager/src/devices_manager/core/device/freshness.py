"""Observation lifetimes derived from the point's configured acquisition cadence."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from devices_manager.core.driver import Driver


def observation_max_age(driver: Driver, name: str) -> float | None:
    """Allow two poll intervals plus read timeout, or one expected push interval.

    Poll grace tolerates the next sweep's scheduling/IO without granting indefinite
    trust. A polling group uses its own interval. Push is a separate acquisition
    promise; when both exist the shorter trust window wins.
    """
    spec = driver.attributes.get(name)
    if spec is None:
        return None
    windows: list[float] = []
    if driver.healthcheck.expected_push_interval is not None:
        windows.append(float(driver.healthcheck.expected_push_interval))
    strategy = driver.update_strategy
    if strategy.polling_enabled and spec.read is not None:
        interval = strategy.polling_groups.get(
            spec.polling_group or "", strategy.polling_interval
        )
        windows.append(2 * interval + (strategy.read_timeout or 0))
    return min(windows) if windows else None

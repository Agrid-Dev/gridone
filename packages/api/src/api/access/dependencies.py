"""FastAPI dependencies that hand a route its scoped device reads.

They live here rather than in ``api.dependencies`` because the policy comes
from the caller's role, which ``api.auth`` resolves, and ``api.auth`` already
imports ``api.dependencies``.
"""

from fastapi import Depends

from api.access.policy import AccessPolicy
from api.access.reads import ScopedDeviceReads
from api.auth import get_current_role
from api.dependencies import get_device_manager
from api.targets import CompositeTargetResolver
from devices_manager import DevicesServiceInterface
from users.roles import Role


def get_device_reads(
    dm: DevicesServiceInterface = Depends(get_device_manager),
    role: Role | None = Depends(get_current_role),
) -> ScopedDeviceReads:
    return ScopedDeviceReads(dm, AccessPolicy.from_role(role))


def get_target_resolver(
    reads: ScopedDeviceReads = Depends(get_device_reads),
) -> CompositeTargetResolver:
    """Targets resolve against what the caller can read: a hidden device is
    neither matched nor reported as excluded."""
    return CompositeTargetResolver(reads)


__all__ = ["get_device_reads", "get_target_resolver"]

"""What a caller's role lets a request read: the scope half of ADR 0004.

The users service stores scopes as data and never evaluates them; the
devices manager never hears of roles. This package is the only place the
two meet: a policy compiled from the role document, and the device reads a
route serves through it.
"""

from api.access.policy import UNRESTRICTED, AccessPolicy
from api.access.reads import ScopedDeviceReads

__all__ = ["UNRESTRICTED", "AccessPolicy", "ScopedDeviceReads"]

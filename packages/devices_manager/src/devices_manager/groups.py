"""Collaborator supplied by the composition root for cross-service references."""

from collections.abc import Awaitable, Callable

from models.resource_conflict import RelatedResource

GroupReferences = Callable[[str], Awaitable[list[RelatedResource]]]

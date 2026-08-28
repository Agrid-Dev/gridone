from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from dashboards.widgets.config import WidgetConfig
from models.errors import InvalidError
from models.targets import AttributeTarget  # noqa: TC001

if TYPE_CHECKING:
    from collections.abc import Iterator

    from models.targets import ResolvedTarget

MAX_DEPTH = 6
"""Deepest nesting a tree may declare, counting the root as level 1.

Sub-metering hierarchies are shallow in practice — a real installation this was
modelled against needs three levels (building, riser, circuit) — but the config
is recursive and server-validated, so an explicit ceiling keeps a hand-written
payload from nesting far enough to be expensive to validate or impossible to
render.
"""

MAX_NODES = 500
"""Most nodes a tree may contain.

Each node with a meter costs one aggregate query, so this bounds the request
fan-out a single widget can trigger rather than anything about rendering.

Raised from 250 once that fan-out was measured instead of guessed at. A real
building's full sub-metering tree — main incomer down to per-room counters —
came to 270 nodes and 254 distinct meters; fetching all of them against a live
deployment took 1.6-3.2s end to end with no failures, at both browser-like and
high concurrency. 500 leaves roughly double that headroom while keeping the
bound finite.

Note this is deliberately the *only* cost control. The client folds deep nodes
by default, which cuts a first paint of that tree from 254 queries to 22, but it
folds by depth and depth is a proxy for breadth rather than a bound on it: a
tree wide at its first level folds nothing. Treating that default as a second
budget would mean two mechanisms for one job, with neither holding on its own."""


class MeterTreeNode(BaseModel):
    """One meter in the hierarchy: a label, optionally a meter, and children.

    ``meter`` is optional because a node may exist purely to group others — a
    riser feeding several floors is often unmetered itself. Such a node totals
    its children and has no residual of its own.
    """

    model_config = ConfigDict(extra="forbid")

    label: Annotated[str, Field(min_length=1)]
    meter: AttributeTarget | None = None
    """The cumulative index this node reads, reduced with ``delta`` over the
    dashboard period.

    Named ``meter`` rather than ``target`` — the type is still the shared
    :class:`AttributeTarget`, but a field called ``target`` on a nested form
    value is unusable in the editor: react-hook-form treats any object with a
    truthy ``target`` as a DOM event and reads ``target.value`` off it, silently
    discarding the node.

    A meter is a device attribute regardless of how the installation is wired:
    an individual meter is its own device with one index attribute, while a
    concentrator exposes many meters as separate attributes on a single device.
    Both collapse to the same (device, attribute) pair here.

    Constrained to exactly one explicit device id — a node is one physical
    meter, so there is nothing for a criteria-based device set to mean.
    """

    scale: float = Field(default=1.0, gt=0)
    """Multiplies this node's reading before anything is computed from it.

    Sub-metered installations are routinely delivered with counters on differing
    scales — one circuit accumulating in Wh next to siblings in kWh, or meters
    commissioned with different CT ratios — and the tree cannot say anything
    true about a set of numbers that are not in the same unit.

    Correcting that at ingestion would be the tidier place, but a counter is
    cumulative: changing its scale mid-series makes ``delta`` read the boundary
    as an enormous negative, and putting the history right first is a migration
    that needs the installer's commissioning data. Calibrating here keeps the
    diagram independent of that, so a tree can be drawn before the source is
    fixed — or when it never is.

    Note the trap for later: if the underlying counters are ever rescaled, every
    saved tree still carries these factors and would correct twice. Scales are
    meant to be reset to 1 in the same change.
    """

    children: list[MeterTreeNode] = Field(default_factory=list)

    @model_validator(mode="after")
    def _require_meter_or_children(self) -> MeterTreeNode:
        """A node with neither a meter nor children carries no information."""
        if self.meter is None and not self.children:
            msg = f"Node {self.label!r} must have a meter or children"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _scale_needs_a_meter(self) -> MeterTreeNode:
        """A scale with no reading to apply it to is a mistake, not a no-op."""
        if self.meter is None and self.scale != 1.0:
            msg = f"Node {self.label!r} has a scale but no meter to apply it to"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _require_single_explicit_device(self) -> MeterTreeNode:
        if self.meter is None:
            return self
        devices = self.meter.devices
        single_id = devices.ids is not None and len(devices.ids) == 1
        if not single_id or devices.types or devices.tags:
            msg = f"Node {self.label!r} meter must be exactly one explicit device id"
            raise ValueError(msg)
        return self

    def walk(self) -> Iterator[MeterTreeNode]:
        """Yield this node then every descendant, depth-first, parents first.

        The order is the contract between :meth:`MeterTreeWidgetConfig.targets`
        and :meth:`MeterTreeWidgetConfig.validate_resolved`: the API resolves
        the flattened targets and hands them back in the same sequence.
        """
        yield self
        for child in self.children:
            yield from child.walk()

    def depth(self) -> int:
        """Levels in the subtree rooted here, counting this node as one."""
        return 1 + max((child.depth() for child in self.children), default=0)


class MeterTreeWidgetConfig(WidgetConfig):
    """Sub-metering tree: consumption per node over the dashboard period.

    The hierarchy is declared here rather than derived from the asset tree: an
    electrical distribution tree does not follow the spatial one — a riser feeds
    floors that sit under different parents, and a single panel can feed a whole
    wing. There is no backend hierarchy model behind this.

    Every node reduces its index with ``delta`` (last value minus the last value
    before the period), so the widget stores no operator: consumption of a
    cumulative counter is the only meaningful reading here.
    """

    type: Literal["meter_tree"] = "meter_tree"
    root: MeterTreeNode

    @model_validator(mode="after")
    def _enforce_size_limits(self) -> MeterTreeWidgetConfig:
        depth = self.root.depth()
        if depth > MAX_DEPTH:
            msg = f"Tree is {depth} levels deep, the maximum is {MAX_DEPTH}"
            raise ValueError(msg)
        count = sum(1 for _ in self.root.walk())
        if count > MAX_NODES:
            msg = f"Tree has {count} nodes, the maximum is {MAX_NODES}"
            raise ValueError(msg)
        return self

    def targets(self) -> list[AttributeTarget]:
        return [node.meter for node in self.root.walk() if node.meter is not None]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        """Every declared meter must resolve to exactly one device.

        Meters arrive in :meth:`MeterTreeNode.walk` order, filtered to the
        nodes that declared one, so they can be zipped back onto their labels to
        say *which* node is at fault — a tree can hold dozens of meters and
        "one meter resolved to 0 devices" would not be actionable.
        """
        labelled = [node for node in self.root.walk() if node.meter is not None]
        for node, resolved_meter in zip(labelled, resolved, strict=True):
            if len(resolved_meter.device_ids) != 1:
                msg = (
                    f"Node {node.label!r} must resolve to exactly one device, "
                    f"got {len(resolved_meter.device_ids)}"
                )
                raise InvalidError(msg)

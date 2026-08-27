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

MAX_NODES = 250
"""Most nodes a tree may contain. Each node costs one aggregate query at render
time, so the bound is really about the request fan-out a single widget can
trigger; a whole real building came to 70."""


class MeterTreeNode(BaseModel):
    """One meter in the hierarchy: a label, optionally a meter, and children.

    ``target`` is optional because a node may exist purely to group others — a
    riser feeding several floors is often unmetered itself. Such a node totals
    its children and has no residual of its own.
    """

    model_config = ConfigDict(extra="forbid")

    label: Annotated[str, Field(min_length=1)]
    target: AttributeTarget | None = None
    """The cumulative index this node reads, reduced with ``delta`` over the
    dashboard period.

    A meter is a device attribute regardless of how the installation is wired:
    an individual meter is its own device with one index attribute, while a
    concentrator exposes many meters as separate attributes on a single device.
    Both collapse to the same (device, attribute) pair here.

    Constrained to exactly one explicit device id — a node is one physical
    meter, so there is nothing for a criteria-based device set to mean.
    """

    children: list[MeterTreeNode] = Field(default_factory=list)

    @model_validator(mode="after")
    def _require_meter_or_children(self) -> MeterTreeNode:
        """A node with neither a meter nor children carries no information."""
        if self.target is None and not self.children:
            msg = f"Node {self.label!r} must have a target or children"
            raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def _require_single_explicit_device(self) -> MeterTreeNode:
        if self.target is None:
            return self
        devices = self.target.devices
        single_id = devices.ids is not None and len(devices.ids) == 1
        if not single_id or devices.types or devices.tags:
            msg = f"Node {self.label!r} target must be exactly one explicit device id"
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
        return [node.target for node in self.root.walk() if node.target is not None]

    def validate_resolved(self, resolved: list[ResolvedTarget]) -> None:
        """Every declared meter must resolve to exactly one device.

        Targets arrive in :meth:`MeterTreeNode.walk` order, filtered to the
        nodes that declared one, so they can be zipped back onto their labels to
        say *which* node is at fault — a tree can hold dozens of meters and
        "one target resolved to 0 devices" would not be actionable.
        """
        labelled = [node for node in self.root.walk() if node.target is not None]
        for node, target in zip(labelled, resolved, strict=True):
            if len(target.device_ids) != 1:
                msg = (
                    f"Node {node.label!r} must resolve to exactly one device, "
                    f"got {len(target.device_ids)}"
                )
                raise InvalidError(msg)

"""The dashboard structure: how dashboards are arranged for navigation.

Dashboards are the operator's views, and a site soon holds a dozen of them.
The structure arranges them in a tree at most two levels deep:

* a **dashboard** at the root is a navigation entry of its own;
* a **group** is an entry (label + icon) whose dashboards are shown as tabs
  within it — the group has no content of its own;
* a **section** is a collapsible heading holding dashboards and groups.

The structure is one document, read and written whole. Sections and groups
exist only at their place in it (label and icon inline); dashboards are the
only entities, referenced by id. The nesting rules are the shape of the
types themselves — a section only at the root, a group at the root or in a
section, a dashboard anywhere but never under a dashboard — so an impossible
tree cannot be expressed, let alone stored.

:class:`DashboardStructureUpdate` is the document as written (and stored);
:class:`DashboardStructure` is the same tree as read, each dashboard id
replaced by its summary so the navigation has what it draws.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from dashboards.models import DashboardIcon, DashboardSummary

if TYPE_CHECKING:
    from collections.abc import Callable

# ---------------------------------------------------------------------------
# The document as written: ids for dashboards, labels inline for the rest
# ---------------------------------------------------------------------------


class DashboardRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["dashboard"]
    id: str


class GroupRef(BaseModel):
    """``id`` is for the client's bookkeeping (keys, remembered state); the
    service assigns one when it is missing, so a new group is just a label."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["group"]
    id: str | None = None
    label: str
    icon: DashboardIcon | None = None
    dashboards: list[str] = Field(default_factory=list)


SectionItemRef = Annotated[GroupRef | DashboardRef, Field(discriminator="kind")]


class SectionRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["section"]
    id: str | None = None
    label: str
    items: list[SectionItemRef] = Field(default_factory=list)


StructureItemRef = Annotated[
    SectionRef | GroupRef | DashboardRef, Field(discriminator="kind")
]


class DashboardStructureUpdate(BaseModel):
    """The whole arrangement. Must place every dashboard exactly once — the
    service enforces that bijection; the tree's shape is the types'."""

    model_config = ConfigDict(extra="forbid")

    items: list[StructureItemRef] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# The document as read: the same tree, dashboards hydrated
# ---------------------------------------------------------------------------


class StructureDashboard(DashboardSummary):
    kind: Literal["dashboard"] = "dashboard"


class StructureGroup(BaseModel):
    kind: Literal["group"] = "group"
    id: str
    label: str
    icon: DashboardIcon | None = None
    dashboards: list[DashboardSummary]


SectionItem = Annotated[
    StructureGroup | StructureDashboard, Field(discriminator="kind")
]


class StructureSection(BaseModel):
    kind: Literal["section"] = "section"
    id: str
    label: str
    items: list[SectionItem]


StructureItem = Annotated[
    StructureSection | StructureGroup | StructureDashboard,
    Field(discriminator="kind"),
]


class DashboardStructure(BaseModel):
    """The whole arrangement, depth-first in display order."""

    items: list[StructureItem]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def dashboard_ids(document: DashboardStructureUpdate) -> list[str]:
    """Every dashboard id the document places, depth-first, duplicates kept
    so a caller can tell a repeated id from a missing one."""
    ids: list[str] = []
    for item in document.items:
        if isinstance(item, SectionRef):
            for child in item.items:
                ids.extend(_section_item_ids(child))
        else:
            ids.extend(_section_item_ids(item))
    return ids


def _section_item_ids(item: GroupRef | DashboardRef) -> list[str]:
    return list(item.dashboards) if isinstance(item, GroupRef) else [item.id]


def reconcile(
    document: DashboardStructureUpdate,
    dashboards: dict[str, DashboardSummary],
    *,
    new_id: Callable[[], str],
) -> DashboardStructureUpdate:
    """The document as it should be stored: sections and groups without an
    id get one, dashboards that no longer exist are dropped, and dashboards
    the document does not place are appended at the root — so a newly
    created dashboard shows up without the document being touched, and a
    deleted one vanishes from it."""

    def keep(item: GroupRef | DashboardRef) -> bool:
        return isinstance(item, GroupRef) or item.id in dashboards

    def group(ref: GroupRef) -> GroupRef:
        return ref.model_copy(
            update={
                "id": ref.id or new_id(),
                "dashboards": [i for i in ref.dashboards if i in dashboards],
            }
        )

    def section_item(ref: GroupRef | DashboardRef) -> GroupRef | DashboardRef:
        return group(ref) if isinstance(ref, GroupRef) else ref

    items: list[SectionRef | GroupRef | DashboardRef] = []
    for ref in document.items:
        if isinstance(ref, SectionRef):
            items.append(
                ref.model_copy(
                    update={
                        "id": ref.id or new_id(),
                        "items": [section_item(c) for c in ref.items if keep(c)],
                    }
                )
            )
        elif keep(ref):
            items.append(section_item(ref))
    placed = set(dashboard_ids(DashboardStructureUpdate(items=items)))
    items.extend(
        DashboardRef(kind="dashboard", id=i) for i in dashboards if i not in placed
    )
    return DashboardStructureUpdate(items=items)


def hydrate(
    document: DashboardStructureUpdate, dashboards: dict[str, DashboardSummary]
) -> DashboardStructure:
    """The read tree of a reconciled document: every id it places is a key
    of ``dashboards`` and every section and group has an id."""

    def dashboard(dashboard_id: str) -> StructureDashboard:
        return StructureDashboard(**dashboards[dashboard_id].model_dump())

    def group(ref: GroupRef) -> StructureGroup:
        return StructureGroup(
            id=_assigned(ref.id),
            label=ref.label,
            icon=ref.icon,
            dashboards=[dashboards[i] for i in ref.dashboards],
        )

    def section_item(
        ref: GroupRef | DashboardRef,
    ) -> StructureGroup | StructureDashboard:
        return group(ref) if isinstance(ref, GroupRef) else dashboard(ref.id)

    items: list[StructureSection | StructureGroup | StructureDashboard] = []
    for ref in document.items:
        if isinstance(ref, SectionRef):
            items.append(
                StructureSection(
                    id=_assigned(ref.id),
                    label=ref.label,
                    items=[section_item(c) for c in ref.items],
                )
            )
        else:
            items.append(section_item(ref))
    return DashboardStructure(items=items)


def _assigned(node_id: str | None) -> str:
    if node_id is None:
        msg = "Structure document was not reconciled: a node has no id"
        raise ValueError(msg)
    return node_id

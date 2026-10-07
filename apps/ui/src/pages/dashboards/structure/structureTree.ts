import type {
  DashboardIcon,
  DashboardStructure,
  DashboardStructureUpdate,
  DashboardSummary,
  StructureGroup,
  StructureItem,
  StructureItemRef,
  StructureSection,
} from "@gridone/sdk";

/**
 * Pure helpers over the structure document: what the sidebar, the detail
 * page and the manage editor derive from it, and how the editor turns its
 * rows back into the document the API takes. No DOM, no React.
 */

export type NodeKind = StructureItem["kind"];

/** Every dashboard the structure places, depth-first — the display order. */
export function flattenDashboards(
  structure: DashboardStructure,
): DashboardSummary[] {
  const out: DashboardSummary[] = [];
  for (const item of structure.items) {
    if (item.kind === "dashboard") out.push(item);
    else if (item.kind === "group") out.push(...item.dashboards);
    else
      for (const child of item.items)
        if (child.kind === "dashboard") out.push(child);
        else out.push(...child.dashboards);
  }
  return out;
}

export function firstDashboardId(structure: DashboardStructure): string | null {
  return flattenDashboards(structure)[0]?.id ?? null;
}

/** The group a dashboard is a tab of, if any. */
export function findGroup(
  structure: DashboardStructure,
  dashboardId: string,
): StructureGroup | null {
  const groups = structure.items.flatMap((item) =>
    item.kind === "group"
      ? [item]
      : item.kind === "section"
        ? item.items.filter((c): c is StructureGroup => c.kind === "group")
        : [],
  );
  return (
    groups.find((g) => g.dashboards.some((d) => d.id === dashboardId)) ?? null
  );
}

/** The read tree as the document that stores it — what the editor sends
 *  back, ids kept so sections and groups keep their identity. */
export function toUpdate(
  structure: DashboardStructure,
): DashboardStructureUpdate {
  const ref = (item: StructureItem): StructureItemRef => {
    if (item.kind === "dashboard") return { kind: "dashboard", id: item.id };
    if (item.kind === "group")
      return {
        kind: "group",
        id: item.id || null,
        label: item.label,
        icon: item.icon ?? null,
        dashboards: item.dashboards.map((d) => d.id),
      };
    return {
      kind: "section",
      id: item.id || null,
      label: item.label,
      items: item.items.map(
        (c) => ref(c) as Exclude<StructureItemRef, { kind: "section" }>,
      ),
    };
  };
  return { items: structure.items.map(ref) };
}

// ---------------------------------------------------------------------------
// The editor's view: one flat list of rows with a depth, like an outline
// ---------------------------------------------------------------------------

export interface Row {
  id: string;
  kind: NodeKind;
  depth: number;
  parentId: string | null;
  label: string;
  icon: DashboardIcon | null;
  /** The summary behind a dashboard row (type badge, description, edit). */
  dashboard: DashboardSummary | null;
}

/** The tree as rows, depth-first. */
export function flatten(structure: DashboardStructure): Row[] {
  const rows: Row[] = [];
  const dashboardRow = (
    d: DashboardSummary,
    depth: number,
    parentId: string | null,
  ): Row => ({
    id: d.id,
    kind: "dashboard",
    depth,
    parentId,
    label: d.name,
    icon: d.icon ?? null,
    dashboard: d,
  });
  const groupRows = (
    g: StructureGroup,
    depth: number,
    parentId: string | null,
  ) => {
    rows.push({
      id: g.id,
      kind: "group",
      depth,
      parentId,
      label: g.label,
      icon: g.icon ?? null,
      dashboard: null,
    });
    for (const d of g.dashboards) rows.push(dashboardRow(d, depth + 1, g.id));
  };
  for (const item of structure.items) {
    if (item.kind === "dashboard") rows.push(dashboardRow(item, 0, null));
    else if (item.kind === "group") groupRows(item, 0, null);
    else {
      rows.push({
        id: item.id,
        kind: "section",
        depth: 0,
        parentId: null,
        label: item.label,
        icon: null,
        dashboard: null,
      });
      for (const child of item.items)
        if (child.kind === "dashboard")
          rows.push(dashboardRow(child, 1, item.id));
        else groupRows(child, 1, item.id);
    }
  }
  return rows;
}

/** Rows back into a tree. Each row's `parentId` names the container it
 *  sits in; `depth` is derived, so callers only maintain `parentId`. */
export function build(rows: Row[]): DashboardStructure {
  const items: StructureItem[] = [];
  const sections = new Map<string, StructureSection>();
  const groups = new Map<string, StructureGroup>();
  for (const row of rows) {
    if (row.kind === "section") {
      const section: StructureSection = {
        kind: "section",
        id: row.id,
        label: row.label,
        items: [],
      };
      sections.set(row.id, section);
      items.push(section);
    } else if (row.kind === "group") {
      const group: StructureGroup = {
        kind: "group",
        id: row.id,
        label: row.label,
        icon: row.icon,
        dashboards: [],
      };
      groups.set(row.id, group);
      const section = row.parentId ? sections.get(row.parentId) : undefined;
      if (section) section.items.push(group);
      else items.push(group);
    } else if (row.dashboard) {
      const group = row.parentId ? groups.get(row.parentId) : undefined;
      const section = row.parentId ? sections.get(row.parentId) : undefined;
      if (group) group.dashboards.push(row.dashboard);
      else if (section)
        section.items.push({ ...row.dashboard, kind: "dashboard" });
      else items.push({ ...row.dashboard, kind: "dashboard" });
    }
  }
  return { items };
}

/** The rows a container holds, transitively — they travel with it. */
export function descendants(rows: Row[], id: string): Row[] {
  const direct = rows.filter((r) => r.parentId === id);
  return direct.flatMap((r) => [r, ...descendants(rows, r.id)]);
}

/** Where a node is dropped: a container (the root being `null`) and the
 *  rank among that container's direct children. */
export interface DropTarget {
  parentId: string | null;
  index: number;
}

/** The direct children of a container, in order. */
export function children(rows: Row[], parentId: string | null): Row[] {
  return rows.filter((r) => r.parentId === parentId);
}

/** Whether `kind` may sit directly in `container` (`null` = the root): a
 *  section only at the root, a group at most in a section, a dashboard
 *  anywhere but under a dashboard. */
export function accepts(container: Row | null, kind: NodeKind): boolean {
  if (container === null) return true;
  if (container.kind === "dashboard") return false;
  if (kind === "section") return false;
  if (kind === "group") return container.kind === "section";
  return true;
}

/** The id a container's drop zone carries, distinct from the node's own id
 *  (a group box is both a draggable node and a place to drop into). */
export const ROOT_DROP_ID = "drop:root";
export const dropId = (containerId: string) => `drop:${containerId}`;

/** Resolve what the pointer is over into a drop target for `activeId`:
 *  over a node → before that node, among its siblings (after it when moving
 *  forward within the same container, so dropping on the next item passes
 *  it); over a drop zone → last in that container. A container that cannot
 *  hold the dragged kind defers to its own container, at its own rank. */
export function dropTarget(
  rows: Row[],
  activeId: string,
  overId: string,
): DropTarget | null {
  const active = rows.find((r) => r.id === activeId);
  if (!active || overId === activeId) return null;
  const moving = new Set([
    activeId,
    ...descendants(rows, activeId).map((r) => r.id),
  ]);
  if (moving.has(overId.replace(/^drop:/, ""))) return null;
  const remaining = rows.filter((r) => !moving.has(r.id));
  const byId = new Map(remaining.map((r) => [r.id, r]));

  let parentId: string | null;
  let index: number;
  if (overId === ROOT_DROP_ID || overId.startsWith("drop:")) {
    parentId = overId === ROOT_DROP_ID ? null : overId.slice("drop:".length);
    if (parentId !== null && !byId.has(parentId)) return null;
    index = children(remaining, parentId).length;
  } else {
    const over = byId.get(overId);
    if (!over) return null;
    parentId = over.parentId;
    index = children(remaining, parentId).indexOf(over);
    const sameContainer = active.parentId === parentId;
    const wasBefore =
      sameContainer &&
      rows.indexOf(active) < rows.indexOf(rows.find((r) => r.id === overId)!);
    if (wasBefore) index += 1;
  }
  // Climb until a container that can hold the dragged kind.
  while (
    !accepts(
      parentId === null ? null : (byId.get(parentId) ?? null),
      active.kind,
    )
  ) {
    const container = byId.get(parentId!);
    if (!container) return null;
    index = children(remaining, container.parentId).indexOf(container) + 1;
    parentId = container.parentId;
  }
  return { parentId, index };
}

/** The rows after moving `activeId` (with its contents) to `target`. */
export function relocate(
  rows: Row[],
  activeId: string,
  target: DropTarget,
): Row[] {
  const active = rows.find((r) => r.id === activeId);
  if (!active) return rows;
  const moving = new Set([
    activeId,
    ...descendants(rows, activeId).map((r) => r.id),
  ]);
  const remaining = rows.filter((r) => !moving.has(r.id));
  const container =
    target.parentId === null
      ? null
      : (remaining.find((r) => r.id === target.parentId) ?? null);
  if (target.parentId !== null && container === null) return rows;
  if (!accepts(container, active.kind)) return rows;
  const depth = container ? container.depth + 1 : 0;
  const shift = depth - active.depth;
  const placed: Row[] = [
    { ...active, depth, parentId: target.parentId },
    ...descendants(rows, activeId).map((r) => ({
      ...r,
      depth: r.depth + shift,
    })),
  ];
  // Insert before the sibling at `index`, or after the container's last
  // descendant (the end of the list at the root).
  const siblings = children(remaining, target.parentId);
  const before = siblings[target.index];
  let at: number;
  if (before) at = remaining.indexOf(before);
  else if (container) {
    const inside = descendants(remaining, container.id);
    const last = inside[inside.length - 1] ?? container;
    at = remaining.indexOf(last) + 1;
  } else at = remaining.length;
  return [...remaining.slice(0, at), ...placed, ...remaining.slice(at)];
}

/** Rows without a container, its contents lifted one level, in place. */
export function dissolve(rows: Row[], id: string): Row[] {
  const container = rows.find((r) => r.id === id);
  if (!container) return rows;
  const lifted = new Set(descendants(rows, id).map((r) => r.id));
  return rows
    .filter((r) => r.id !== id)
    .map((r) =>
      r.parentId === id
        ? { ...r, parentId: container.parentId, depth: r.depth - 1 }
        : lifted.has(r.id)
          ? { ...r, depth: r.depth - 1 }
          : r,
    );
}

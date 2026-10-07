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

export interface Projection {
  depth: number;
  parentId: string | null;
}

/** dnd-kit's sortable semantics: the active row takes the over row's index,
 *  its subtree set aside (it travels with it, see `move`). */
function reordered(rows: Row[], activeId: string, overId: string): Row[] {
  const subtree = new Set(descendants(rows, activeId).map((r) => r.id));
  const list = rows.filter((r) => !subtree.has(r.id));
  const from = list.findIndex((r) => r.id === activeId);
  const to = list.findIndex((r) => r.id === overId);
  if (from < 0 || to < 0) return list;
  const [active] = list.splice(from, 1);
  if (active) list.splice(to, 0, active);
  return list;
}

/** Where a dragged row would land: at the over row's index, pushed to the
 *  depth the pointer asks for and clamped to what the neighbours allow and
 *  the kind permits — a section only at the root, a group at most in a
 *  section, a dashboard at most in a group. `null` when nothing fits. */
export function project(
  rows: Row[],
  activeId: string,
  overId: string,
  wantedDepth: number,
): Projection | null {
  const list = reordered(rows, activeId, overId);
  const at = list.findIndex((r) => r.id === activeId);
  const active = list[at];
  if (!active) return null;
  const previous = list[at - 1] ?? null;
  const next = list[at + 1] ?? null;
  const maxDepth = previous
    ? previous.kind === "dashboard"
      ? previous.depth
      : previous.depth + 1
    : 0;
  const minDepth = next ? next.depth : 0;
  const kindMax =
    active.kind === "section" ? 0 : active.kind === "group" ? 1 : 2;
  const depth = Math.max(minDepth, Math.min(wantedDepth, maxDepth, kindMax));
  if (depth === 0) return { depth: 0, parentId: null };
  // The parent is the nearest row above at depth - 1.
  for (let i = at - 1; i >= 0; i -= 1) {
    const candidate = list[i];
    if (!candidate || candidate.depth < depth - 1) break;
    if (candidate.depth === depth - 1) {
      if (candidate.kind === "dashboard") return null;
      if (active.kind === "group" && candidate.kind !== "section") return null;
      return { depth, parentId: candidate.id };
    }
  }
  return null;
}

/** The rows after dropping `activeId` (with its subtree) at `overId` with
 *  the given projection. */
export function move(
  rows: Row[],
  activeId: string,
  overId: string,
  projection: Projection,
): Row[] {
  const active = rows.find((r) => r.id === activeId);
  if (!active) return rows;
  const shift = projection.depth - active.depth;
  const subtree = descendants(rows, activeId).map((r) => ({
    ...r,
    depth: r.depth + shift,
  }));
  return reordered(rows, activeId, overId).flatMap((r) =>
    r.id === activeId
      ? [
          { ...r, depth: projection.depth, parentId: projection.parentId },
          ...subtree,
        ]
      : [r],
  );
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

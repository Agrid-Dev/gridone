import type { PageNode, PresentationV1, SetpointRow } from "./document";

/**
 * The driver's page tree, keeping only what a user can command.
 *
 * A multi-device cockpit aggregates its values across members, so a reported
 * value is either identical everywhere (rare) or shown as "several values" —
 * noise in a screen whose purpose is to send one setpoint to everyone. This
 * is a pure transform applied by the page that needs it; the render engine
 * stays generic and the driver's document is never mutated.
 *
 * What goes: `measurements` nodes, the regulated / measured / deviation
 * columns of a setpoint table, and setpoint rows whose demanded value is a
 * plain reading rather than a control. Containers left empty are pruned so
 * no section renders an empty frame.
 */
export function writableOnlyPresentation(
  document: PresentationV1,
): PresentationV1 {
  const page = writableOnlyNode(document.page);
  return page === document.page
    ? document
    : { ...document, page: page ?? { kind: "stack", children: [] } };
}

/** The node with read-only content removed, or null when nothing is left. */
function writableOnlyNode(node: PageNode): PageNode | null {
  switch (node.kind) {
    case "measurements":
      return null;
    case "setpoint-table": {
      const rows = mapKeepingIdentity(node.rows, (row) =>
        isCommandableRow(row) ? withoutReadings(row) : null,
      );
      if (!rows.length) return null;
      return rows === node.rows ? node : { ...node, rows };
    }
    case "stack":
    case "section": {
      const children = mapKeepingIdentity(node.children, writableOnlyNode);
      if (!children.length) return null;
      return children === node.children ? node : { ...node, children };
    }
    case "columns": {
      const items = mapKeepingIdentity(node.items, (item) => {
        const content = writableOnlyNode(item.content);
        if (content === null) return null;
        return content === item.content ? item : { ...item, content };
      });
      if (!items.length) return null;
      return items === node.items ? node : { ...node, items };
    }
    default:
      return node;
  }
}

/**
 * The mapped list, or the very same array when every element came back
 * identical. Identity has to survive all the way up, otherwise a transform
 * that removes nothing still hands back a freshly built document and the
 * "unchanged documents are returned as they are" contract is a fiction.
 */
function mapKeepingIdentity<T>(items: T[], map: (item: T) => T | null): T[] {
  const kept: T[] = [];
  let changed = false;
  for (const item of items) {
    const mapped = map(item);
    if (mapped !== item) changed = true;
    if (mapped !== null) kept.push(mapped);
  }
  return changed ? kept : items;
}

/** A row whose demanded value is a control the user can act on. */
function isCommandableRow(row: SetpointRow): boolean {
  return "control" in row.demanded;
}

/** An allow-list, not a deny-list: a read-only field added to `SetpointRow`
 *  later must be opted into rather than leak into the group view. */
function withoutReadings(row: SetpointRow): SetpointRow {
  if (!row.regulated && !row.measured && !row.deviation) return row;
  return { label: row.label, demanded: row.demanded, formatter: row.formatter };
}

/**
 * The same page with the decorative frame around a lone device face removed.
 *
 * A driver titles that frame for what it holds — "Live", "En direct". A page
 * that substitutes the face (a group cockpit shows the setpoints awaiting
 * validation there) would keep a heading describing something that is no
 * longer on screen. Only a section whose *sole* child is the face is
 * unwrapped: a frame holding more than the face still describes the rest.
 */
export function unwrapDeviceFaceSection(
  document: PresentationV1,
): PresentationV1 {
  const page = unwrapNode(document.page);
  return page === document.page ? document : { ...document, page };
}

function unwrapNode(node: PageNode): PageNode {
  switch (node.kind) {
    case "section": {
      const [only] = node.children;
      if (node.children.length === 1 && only.kind === "device-face")
        return only;
      return withChildren(node, mapKeepingIdentity(node.children, unwrapNode));
    }
    case "stack":
      return withChildren(node, mapKeepingIdentity(node.children, unwrapNode));
    case "columns": {
      const items = mapKeepingIdentity(node.items, (item) => {
        const content = unwrapNode(item.content);
        return content === item.content ? item : { ...item, content };
      });
      return items === node.items ? node : { ...node, items };
    }
    default:
      return node;
  }
}

function withChildren<T extends { children: PageNode[] }>(
  node: T,
  children: PageNode[],
): T {
  return children === node.children ? node : { ...node, children };
}

/** Does the document place a device face anywhere in its page tree? */
export function hasDeviceFace(document: PresentationV1): boolean {
  return containsDeviceFace(document.page);
}

function containsDeviceFace(node: PageNode): boolean {
  switch (node.kind) {
    case "device-face":
      return true;
    case "stack":
    case "section":
      return node.children.some(containsDeviceFace);
    case "columns":
      return node.items.some((item) => containsDeviceFace(item.content));
    default:
      return false;
  }
}

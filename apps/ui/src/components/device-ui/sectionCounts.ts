import type { PageNode } from "./document";

/** Count distinct controls and readings recursively, without counting face mirrors twice. */
export function sectionCounts(node: PageNode) {
  const controls = new Set<string>();
  const measurements = new Set<string>();
  const visit = (child: PageNode) => {
    switch (child.kind) {
      case "stack":
      case "section":
        child.children.forEach(visit);
        break;
      case "columns":
        child.items.forEach((item) => visit(item.content));
        break;
      case "control-panel":
        child.controls.forEach((id) => controls.add(id));
        break;
      case "measurements":
        child.items.forEach((item) => measurements.add(item.binding));
        break;
      case "setpoint-table":
        child.rows.forEach((row) => {
          if ("control" in row.demanded) controls.add(row.demanded.control);
          else measurements.add(row.demanded.binding);
          if (row.regulated) measurements.add(row.regulated.binding);
          if (row.measured) measurements.add(row.measured.binding);
        });
    }
  };
  visit(node);
  return { controls: controls.size, measurements: measurements.size };
}

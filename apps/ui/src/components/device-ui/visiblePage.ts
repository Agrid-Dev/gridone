import type { Condition } from "./conditions";
import type { PageNode } from "./document";

/**
 * Prune the driver's page using the caller's projected attributes. An absent
 * attribute is inaccessible; a present attribute with a null value is still
 * readable. Write eligibility is deliberately separate from visibility.
 * Paths retain the authored positions so removing a sibling does not transfer
 * its disclosure state to another section.
 */
export function visiblePage(
  page: PageNode,
  {
    hasBinding,
    hasControl,
    hasAttributes,
    holds,
  }: {
    hasBinding: (binding: string) => boolean;
    hasControl: (control: string) => boolean;
    hasAttributes: (group?: string) => boolean;
    holds: (condition?: Condition) => boolean;
  },
) {
  const paths = new Map<PageNode, string>();
  const visit = (node: PageNode, path: string): PageNode | null => {
    if (!holds(node.visible_when)) return null;
    const keep = (visible: PageNode) => {
      paths.set(visible, path);
      return visible;
    };
    switch (node.kind) {
      case "variant": {
        // Pick before pruning: an inaccessible first match must not expose a
        // later variant that the driver did not select.
        const index = node.variants.findIndex((variant) => holds(variant.when));
        return index < 0
          ? null
          : visit(node.variants[index].content, `${path}/variants/${index}`);
      }
      case "stack":
      case "section": {
        const children = node.children.flatMap((child, index) => {
          const visible = visit(child, `${path}/children/${index}`);
          return visible ? [visible] : [];
        });
        return children.length ? keep({ ...node, children }) : null;
      }
      case "columns": {
        const items = node.items.flatMap((item, index) => {
          const content = visit(item.content, `${path}/items/${index}`);
          return content ? [{ ...item, content }] : [];
        });
        return items.length ? keep({ ...node, items }) : null;
      }
      case "control-panel": {
        const controls = node.controls.filter(hasControl);
        return controls.length ? keep({ ...node, controls }) : null;
      }
      case "measurements": {
        const items = node.items.filter((item) => hasBinding(item.binding));
        return items.length ? keep({ ...node, items }) : null;
      }
      case "setpoint-table": {
        const rows = node.rows.flatMap((row) => {
          const accessible =
            "control" in row.demanded
              ? hasControl(row.demanded.control)
              : hasBinding(row.demanded.binding);
          if (!accessible) return [];
          return [
            {
              ...row,
              regulated:
                row.regulated && hasBinding(row.regulated.binding)
                  ? row.regulated
                  : undefined,
              measured:
                row.measured && hasBinding(row.measured.binding)
                  ? row.measured
                  : undefined,
              deviation:
                row.deviation &&
                hasBinding(row.deviation.minuend) &&
                hasBinding(row.deviation.subtrahend)
                  ? row.deviation
                  : undefined,
            },
          ];
        });
        return rows.length ? keep({ ...node, rows }) : null;
      }
      case "attributes":
        return hasAttributes(node.group) ? keep(node) : null;
      case "device-face":
        return keep(node);
    }
  };
  return { page: visit(page, "/page"), paths };
}

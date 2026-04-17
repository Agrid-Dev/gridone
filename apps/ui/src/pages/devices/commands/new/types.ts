import type { Asset, AssetTreeNode } from "@/api/assets";
import type { Device, DeviceAttribute } from "@/api/devices";

/** The three entry points into the wizard. */
export type WizardContext = "open" | "device" | "asset";

export type AttributeDataType = "int" | "float" | "bool" | "str";

export type WritableAttribute = {
  name: string;
  dataType: AttributeDataType;
};

/** The form data owned by react-hook-form. Everything else the wizard needs
 *  (filters, asset tree lookups) is derived or held as local UI state. */
export type WizardFormValues = {
  deviceIds: string[];
  attribute?: string;
  attributeDataType?: AttributeDataType;
  value?: string | number | boolean;
};

/** Intersection of writable attributes across a set of devices. An attribute
 *  is included only if every device in the list exposes it as writable with
 *  the same data type. */
export function intersectWritableAttributes(
  devices: Device[],
): WritableAttribute[] {
  if (devices.length === 0) return [];

  const writablesOfFirst = Object.values(devices[0].attributes).filter(
    (a: DeviceAttribute) => a.readWriteModes.includes("write"),
  );

  return writablesOfFirst
    .filter((attr) =>
      devices.every((d) => {
        const match = Object.values(d.attributes).find(
          (a: DeviceAttribute) => a.name === attr.name,
        );
        return (
          !!match &&
          match.readWriteModes.includes("write") &&
          match.dataType === attr.dataType
        );
      }),
    )
    .map((attr) => ({
      name: attr.name,
      dataType: attr.dataType as AttributeDataType,
    }));
}

/** All device IDs linked to the asset or any of its descendants. */
export function resolveAssetSubtreeDeviceIds(
  tree: AssetTreeNode[],
  assetId: string,
): string[] {
  const node = findAssetNode(tree, assetId);
  if (!node) return [];
  return collectSubtreeDeviceIds(node);
}

function findAssetNode(
  nodes: AssetTreeNode[],
  id: string,
): AssetTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findAssetNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function collectSubtreeDeviceIds(node: AssetTreeNode): string[] {
  const here = (node.devices ?? []).map((d) => d.id);
  const below = node.children.flatMap(collectSubtreeDeviceIds);
  return [...here, ...below];
}

/** Flatten the asset tree into a sorted list for the filter dropdown. */
export function flattenAssetTree(tree: AssetTreeNode[]): Asset[] {
  const out: Asset[] = [];
  const walk = (nodes: AssetTreeNode[]) => {
    for (const n of nodes) {
      out.push({
        id: n.id,
        parentId: n.parentId,
        type: n.type,
        name: n.name,
        path: n.path,
        position: n.position,
      });
      walk(n.children);
    }
  };
  walk(tree);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

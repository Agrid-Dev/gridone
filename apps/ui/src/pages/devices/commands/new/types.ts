import type { Asset, AssetTreeNode } from "@/api/assets";
import type { Device, DeviceAttribute, DevicesFilter } from "@/api/devices";

export type AttributeDataType = "int" | "float" | "bool" | "str";

export type WritableAttribute = {
  name: string;
  dataType: AttributeDataType;
};

/** How the user described the target. "devices" freezes the selection to an
 *  explicit id list (what the user picked in the table); "filters" captures
 *  the ``asset_id``/``types`` filter that the server re-resolves at each
 *  dispatch, so saved templates follow the asset's current membership. */
export type TargetMode = "devices" | "filters";

/** The filter-mode form state: the narrow subset of DevicesFilter that the
 *  filter-mode UI lets the user edit today. */
export type TargetFilter = {
  assetId?: string;
  types?: string[];
};

/** The form data owned by react-hook-form. Everything else the wizard needs
 *  (filters, asset tree lookups) is derived or held as local UI state. */
export type WizardFormValues = {
  targetMode: TargetMode;
  deviceIds: string[];
  targetFilter: TargetFilter;
  attribute?: string;
  attributeDataType?: AttributeDataType;
  value?: string | number | boolean;
  /** Only populated when the user is saving the wizard as a template. */
  templateName?: string;
};

/** Is *device* a member of the given filter? Mirrors backend semantics:
 *  ``ids`` and ``types`` are whitelists, ``assetId`` matches the device's
 *  ``asset_id`` tag (camelcased to ``assetId`` by the ``request`` helper's
 *  deep ``camelcase-keys`` transform). */
export function deviceMatchesFilter(
  device: Device,
  filter: DevicesFilter,
): boolean {
  if (filter.ids && filter.ids.length > 0 && !filter.ids.includes(device.id)) {
    return false;
  }
  if (filter.types && filter.types.length > 0) {
    if (!device.type || !filter.types.includes(device.type)) {
      return false;
    }
  }
  if (filter.assetId && device.tags.assetId !== filter.assetId) {
    return false;
  }
  return true;
}

/** Resolve a filter against the caller's devices list. An empty filter
 *  resolves to nothing — "everything" is never an intentional target and
 *  we don't want a naked save-template to dispatch to every device. */
export function resolveFilter(
  devices: Device[],
  filter: DevicesFilter,
): Device[] {
  if (isEmptyFilter(filter)) return [];
  return devices.filter((d) => deviceMatchesFilter(d, filter));
}

export function isEmptyFilter(filter: DevicesFilter): boolean {
  return (
    !(filter.ids && filter.ids.length > 0) &&
    !(filter.types && filter.types.length > 0) &&
    !filter.assetId
  );
}

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

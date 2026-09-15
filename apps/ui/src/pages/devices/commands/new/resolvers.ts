import type { Device } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import {
  deviceAttributes,
  isEmptyFilter,
  type AttributeValue,
  type DeviceAttribute,
  type DevicesFilter,
} from "@/lib/devices";
import type { TargetFilter } from "./types";

export { isEmptyFilter };

/** Attribute maps are untyped on the wire (`Record<string, unknown>`), so the
 *  field reads below narrow at the access site. */
function isWritable(attr: DeviceAttribute): boolean {
  return ((attr.read_write_modes as string[] | undefined) ?? []).includes(
    "write",
  );
}

/** Prefill only when every writable device reports the same known value. */
export function currentValueFor(
  devices: Device[],
  attributeName: string,
): AttributeValue | undefined {
  const attributes = devices
    .map((d) => deviceAttributes(d)[attributeName])
    .filter((attr) => attr && isWritable(attr));
  const value = attributes[0]?.current_value;
  return (typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean") &&
    attributes.every((attr) => attr.current_value === value)
    ? value
    : undefined;
}

/** Is *device* a member of the given filter? Mirrors backend semantics. */
export function deviceMatchesFilter(
  device: Device,
  filter: DevicesFilter,
): boolean {
  if (filter.ids && !filter.ids.includes(device.id)) {
    return false;
  }
  if (filter.types && filter.types.length > 0) {
    if (!device.type || !filter.types.includes(device.type)) {
      return false;
    }
  }
  if (filter.asset_id && device.tags?.["asset_id"] !== filter.asset_id) {
    return false;
  }
  if (
    filter.tags &&
    !Object.entries(filter.tags).every(([key, values]) =>
      values.includes(device.tags?.[key] ?? ""),
    )
  )
    return false;
  return true;
}

/** Resolve a filter against the caller's devices list. An empty filter
 *  resolves to nothing — "everything" is never an intentional target. */
export function resolveFilter(
  devices: Device[],
  filter: DevicesFilter,
): Device[] {
  if (isEmptyFilter(filter)) return [];
  return devices.filter((d) => deviceMatchesFilter(d, filter));
}

/** Map the filter-mode form state (camelCase ``assetId``) onto the
 *  wire-format ``DevicesFilter`` expected by ``resolveFilter`` and the
 *  target payload. */
export function targetFilterToDevicesFilter(
  filter: TargetFilter | undefined,
): DevicesFilter {
  return {
    types: filter?.types,
    asset_id: filter?.assetId,
  };
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

/** Asset itself and every descendant, including empty rooms for live targets. */
export function resolveAssetSubtreeIds(
  tree: AssetTreeNode[],
  assetId: string,
): string[] {
  const node = findAssetNode(tree, assetId);
  if (!node) return [];
  const collect = (current: AssetTreeNode): string[] => [
    current.id,
    ...current.children.flatMap(collect),
  ];
  return collect(node);
}

function collectSubtreeDeviceIds(node: AssetTreeNode): string[] {
  const here = (node.devices ?? []).map((d) => d.id);
  const below = node.children.flatMap(collectSubtreeDeviceIds);
  return [...here, ...below];
}

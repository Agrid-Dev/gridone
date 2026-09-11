import type { Device, DeviceGroup } from "@gridone/sdk";
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

/** Value options for *attrName* across the selected devices that expose it as
 *  writable — mirroring dispatch semantics, where devices not exposing the
 *  attribute as writable are excluded server-side. Defined only when every
 *  exposing device agrees on the same non-empty option list (driver-defined,
 *  so same-type devices always agree; mixed sets fall back to free-text). */
export function valueOptionsFor(
  devices: Device[],
  attrName: string,
): AttributeValue[] | undefined {
  const exposing = devices.filter((d) => {
    const match = Object.values(deviceAttributes(d)).find(
      (a) => a.name === attrName,
    );
    return !!match && isWritable(match);
  });
  if (exposing.length === 0) return undefined;
  return intersectValueOptions(exposing, attrName);
}

function intersectValueOptions(
  devices: Device[],
  attrName: string,
): AttributeValue[] | undefined {
  const optionSets = devices.map(
    (d) =>
      (Object.values(deviceAttributes(d)).find((a) => a.name === attrName)
        ?.value_options as AttributeValue[] | undefined) ?? null,
  );
  const first = optionSets[0];
  if (!first || first.length === 0) return undefined;
  const allMatch = optionSets.every(
    (opts) =>
      opts !== null &&
      opts.length === first.length &&
      opts.every((v, i) => v === first[i]),
  );
  return allMatch ? first : undefined;
}

/** Pre-fill only a value that every selected member has actually reported. */
export function currentValueFor(
  devices: Device[],
  attributeName: string,
): AttributeValue | undefined {
  if (!devices.length) return undefined;
  const values = devices.map(
    (device) => deviceAttributes(device)[attributeName]?.current_value,
  );
  const value = values[0];
  return value != null && values.every((item) => item === value)
    ? (value as AttributeValue)
    : undefined;
}

/** Is *device* a member of the given filter? Mirrors backend semantics. */
export function deviceMatchesFilter(
  device: Device,
  filter: DevicesFilter,
  groups: DeviceGroup[] = [],
): boolean {
  if (
    filter.group_id &&
    !groups
      .find((group) => group.id === filter.group_id)
      ?.device_ids?.includes(device.id)
  )
    return false;
  if (filter.ids && !filter.ids.includes(device.id)) {
    return false;
  }
  if (filter.types && filter.types.length > 0) {
    if (!device.type || !filter.types.includes(device.type)) {
      return false;
    }
  }
  if (
    filter.tags &&
    !Object.entries(filter.tags).every(([key, values]) =>
      values.includes(device.tags?.[key] ?? ""),
    )
  )
    return false;
  if (filter.asset_id && device.tags?.["asset_id"] !== filter.asset_id) {
    return false;
  }
  return true;
}

/** Resolve a filter against the caller's devices list. An empty filter
 *  resolves to nothing — "everything" is never an intentional target. */
export function resolveFilter(
  devices: Device[],
  filter: DevicesFilter,
  groups: DeviceGroup[] = [],
): Device[] {
  if (isEmptyFilter(filter)) return [];
  return devices.filter((d) => deviceMatchesFilter(d, filter, groups));
}

/** Map the filter-mode form state (camelCase ``assetId``) onto the
 *  wire-format ``DevicesFilter`` expected by ``resolveFilter`` and the
 *  target payload. */
export function targetFilterToDevicesFilter(
  filter: TargetFilter | undefined,
): DevicesFilter {
  return {
    types: filter?.types,
    ...(filter?.groupId ? { group_id: filter.groupId } : {}),
    ...(filter?.ids ? { ids: filter.ids } : {}),
    ...(filter?.tags ? { tags: filter.tags } : {}),
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

function collectSubtreeDeviceIds(node: AssetTreeNode): string[] {
  const here = (node.devices ?? []).map((d) => d.id);
  const below = node.children.flatMap(collectSubtreeDeviceIds);
  return [...here, ...below];
}

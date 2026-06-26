import type { AssetTreeNode } from "@/api/assets";
import type {
  AttributeValue,
  Device,
  DeviceAttribute,
  DevicesFilter,
} from "@/api/devices";
import type { AttributeDataType, WritableAttribute } from "./types";

/** Intersection of writable attributes across a set of devices. An attribute
 *  is included only if every device in the list exposes it as writable with
 *  the same data type. `valueOptions` is included only when every device
 *  agrees on the same non-null option list (driver-defined, so same-type
 *  devices always agree; mixed selections fall back to free-text). */
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
      valueOptions: intersectValueOptions(devices, attr.name),
    }));
}

function intersectValueOptions(
  devices: Device[],
  attrName: string,
): AttributeValue[] | undefined {
  const optionSets = devices.map(
    (d) =>
      Object.values(d.attributes).find((a) => a.name === attrName)
        ?.valueOptions ?? null,
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

/** The current value of *attributeName* on the first device, or undefined when
 *  the device, attribute, or value is missing. Used to pre-fill the command
 *  form's value with what the device currently reports. */
export function currentValueFor(
  devices: Device[],
  attributeName: string,
): AttributeValue | undefined {
  const first = devices[0];
  if (!first) return undefined;
  const value = Object.values(first.attributes).find(
    (a) => a.name === attributeName,
  )?.currentValue;
  return value ?? undefined;
}

/** Is *device* a member of the given filter? Mirrors backend semantics. */
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
 *  resolves to nothing — "everything" is never an intentional target. */
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

import { useQueries } from "@tanstack/react-query";
import type { Device, MeterTreeNode } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  parseMeterKey,
  visibleMeterKeys,
  type CollapsedNodes,
  type MeterAttribute,
  type MeterAttributes,
} from "./meterTree";

/**
 * What each meter's driver declares about the attribute it reads — its label
 * and unit — for the meters the tree currently draws.
 *
 * One query per *device*, not per meter: a concentrator exposes many meters as
 * attributes of a single device, and fetching it once serves them all. Keyed
 * like `useDevice`, so a device already loaded elsewhere is not fetched again.
 *
 * A device that fails to load leaves its meters out of the map, which the tree
 * reads as "unit unknown": the figures still draw, just bare.
 */
export function useMeterTreeAttributes(
  root: MeterTreeNode | undefined,
  collapsed?: CollapsedNodes,
): MeterAttributes {
  const client = useGridoneClient();
  const keys = root ? visibleMeterKeys(root, collapsed) : [];
  const deviceIds = [
    ...new Set(keys.map((key) => parseMeterKey(key).deviceId)),
  ];

  const results = useQueries({
    queries: deviceIds.map((deviceId) => ({
      queryKey: ["device", deviceId],
      queryFn: () => client.devices.get(deviceId),
      retry: false,
    })),
  });

  const devices = new Map<string, Device>();
  deviceIds.forEach((deviceId, index) => {
    const device = results[index]?.data;
    if (device) devices.set(deviceId, device);
  });

  const attributes = new Map<string, MeterAttribute>();
  for (const key of keys) {
    const { deviceId, attribute } = parseMeterKey(key);
    const device = devices.get(deviceId);
    if (!device) continue;
    // A device that no longer exposes the attribute still answered: the meter
    // is known to have no label or unit, rather than not known yet.
    attributes.set(key, device.attributes?.[attribute] ?? {});
  }
  return attributes;
}

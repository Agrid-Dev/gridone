import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { AttributeTarget, Device, Synoptic } from "@gridone/sdk";
import { useDeviceContext } from "@/contexts/DeviceContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { DEVICE_POLL_INTERVAL_MS } from "@/hooks/useDevice";
import { useNow } from "@/hooks/useNow";
import { deviceAttributes, devicesFilterToListParams } from "@/lib/devices";
import type { AttributeFields } from "@/lib/faults";
import {
  boundSlots,
  formatValue,
  isStale,
  targetDeviceId,
  targetKey,
  type SlotReading,
  type SynopticValues,
} from "../values";

/** `at` is the time cursor a later version reads values at; v1 ignores
 *  it, so adding the cursor is an addition rather than a refactor. */
export type UseSynopticValues = (doc: Synoptic, at?: string) => SynopticValues;

/**
 * The live reading of every device-bound slot of a plate, and the fault
 * state of every device it names. Literal slots are the renderer's.
 *
 * A target naming one id reads that device; any other filter is listed
 * once and must yield one device, which the save-time rule guarantees.
 * Devices are read through the `["device", id]` query the WebSocket
 * handler patches, so a `device_update` re-renders the plate with no
 * polling. Only while the socket is down do the devices poll, as
 * `useDevice` does.
 */
export const useSynopticValues: UseSynopticValues = (doc) => {
  const client = useGridoneClient();
  const { isConnected } = useDeviceContext();
  const now = useNow();
  const slots = useMemo(() => boundSlots(doc), [doc]);

  const filterTargets = useMemo(() => {
    const byKey = new Map<string, AttributeTarget>();
    for (const { slot } of slots) {
      if (!targetDeviceId(slot.target)) {
        byKey.set(targetKey(slot.target), slot.target);
      }
    }
    return [...byKey.values()];
  }, [slots]);

  const resolved = useQueries({
    queries: filterTargets.map((target) => ({
      queryKey: ["devices", target.devices],
      queryFn: () =>
        client.devices.list(devicesFilterToListParams(target.devices)),
    })),
    combine: (results) => {
      const ids: Record<string, string> = {};
      results.forEach((result, i) => {
        const devices = result.data;
        if (devices?.length === 1) {
          ids[targetKey(filterTargets[i])] = devices[0].id;
        }
      });
      return ids;
    },
  });

  const deviceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const symbol of doc.symbols ?? []) {
      if (symbol.device_id) ids.add(symbol.device_id);
    }
    for (const { slot } of slots) {
      const id =
        targetDeviceId(slot.target) ?? resolved[targetKey(slot.target)];
      if (id) ids.add(id);
    }
    return [...ids];
  }, [doc, slots, resolved]);

  const devices = useQueries({
    queries: deviceIds.map((id) => ({
      queryKey: ["device", id],
      queryFn: () => client.devices.get(id),
      refetchInterval: isConnected ? false : DEVICE_POLL_INTERVAL_MS,
    })),
    combine: (results) => {
      const byId: Record<string, Device> = {};
      results.forEach((result, i) => {
        if (result.data) byId[deviceIds[i]] = result.data;
      });
      return byId;
    },
  });

  return useMemo(() => {
    const readings: Record<string, SlotReading> = {};
    const defaultStaleAfter = doc.defaults?.stale_after;
    for (const { key, slot } of slots) {
      const id =
        targetDeviceId(slot.target) ?? resolved[targetKey(slot.target)];
      const device = id ? devices[id] : undefined;
      const attr = device
        ? (deviceAttributes(device)[slot.target.attribute] as
            | AttributeFields
            | undefined)
        : undefined;
      const faulty = device?.is_faulty === true;
      if (!attr || attr.current_value == null || !attr.last_updated) {
        readings[key] = { text: null, raw: null, stale: false, faulty };
        continue;
      }
      readings[key] = {
        text: formatValue(slot, attr.current_value),
        raw: attr.current_value,
        stale: isStale(
          attr.last_updated,
          slot.stale_after ?? defaultStaleAfter,
          now,
        ),
        faulty,
      };
    }
    const faultyDevices: Record<string, boolean> = {};
    for (const [id, device] of Object.entries(devices)) {
      faultyDevices[id] = device.is_faulty === true;
    }
    return { slots: readings, faultyDevices };
  }, [doc, slots, resolved, devices, now]);
};

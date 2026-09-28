import { useMemo } from "react";
import type { Device } from "@gridone/sdk";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useDeviceZonePath } from "@/hooks/useDeviceZonePath";
import type { DevicesFilter } from "@/lib/devices";
import {
  countDevicesByType,
  deviceTypeKey,
  groupDevicesByType,
  OTHER_KEY,
  type DeviceTypeGroup,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";
import {
  countByConnectionStatus,
  type ConnectionCounts,
} from "@/lib/deviceSummary";

type DevicesPage = {
  /** Type buckets of the filtered devices, in display order. */
  groups: DeviceTypeGroup[];
  /** Unfiltered per-type counts for the type filter. */
  typeCounts: Map<DeviceTypeKey, number>;
  /** Unfiltered fleet size. */
  total: number;
  /** Unfiltered count of devices with an active fault. */
  faultyCount: number;
  /** Devices left once filters apply. */
  shown: number;
  /** Unfiltered connection tally for the header summary. */
  connectionCounts: ConnectionCounts;
  summaryLoading: boolean;
  /** Full placement of a device ("Floor 2 · Room 201") — the card subtitle,
   *  which has the room to carry the whole chain. */
  zonePathOf: (device: Device) => string | null;
  loading: boolean;
  error: string | null;
  hasFilters: boolean;
};

/** Data layer of the devices list page. The list keeps server-side
 *  filtering (URL params → `GET /devices`); filter counts and the fleet
 *  summary come from a second, unfiltered fetch that shares the
 *  `["devices", undefined]` cache the sidebar keeps warm. */
export function useDevicesPage(): DevicesPage {
  const filter = useFilterParams();
  const selectedTypes = useMemo(() => filter?.types ?? [], [filter]);
  const otherSelected = selectedTypes.includes(OTHER_KEY);

  // `other` is a UI bucket, not a wire type: the server cannot express
  // "type outside the standard enum", so when it is selected the type
  // criterion is dropped from the server filter and re-applied client-side
  // below, over every selected bucket.
  const serverFilter = useMemo(() => {
    if (!otherSelected || !filter) return filter;
    const rest: DevicesFilter = { ...filter };
    delete rest.types;
    return Object.keys(rest).length === 0 ? undefined : rest;
  }, [filter, otherSelected]);

  const { devices: fetched, loading, error } = useDevicesList(serverFilter);
  const { devices: allDevices, loading: summaryLoading } = useDevicesList();
  const zonePathOf = useDeviceZonePath();

  const groups = useMemo(() => {
    const filteredDevices = otherSelected
      ? fetched.filter((device) =>
          selectedTypes.includes(deviceTypeKey(device)),
        )
      : fetched;
    return groupDevicesByType(filteredDevices);
  }, [fetched, otherSelected, selectedTypes]);

  const typeCounts = useMemo(
    () => countDevicesByType(allDevices),
    [allDevices],
  );
  const connectionCounts = useMemo(
    () => countByConnectionStatus(allDevices),
    [allDevices],
  );

  return {
    groups,
    typeCounts,
    total: allDevices.length,
    faultyCount: allDevices.filter((device) => device.is_faulty).length,
    shown: groups.reduce((sum, group) => sum + group.devices.length, 0),
    connectionCounts,
    summaryLoading,
    zonePathOf,
    loading,
    error,
    hasFilters: !!filter,
  };
}

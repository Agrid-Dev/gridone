import { useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Device } from "@gridone/sdk";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useAssetTree } from "@/hooks/useAssetTree";
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
  /** Type buckets of the filtered table, in display order. */
  groups: DeviceTypeGroup[];
  /** Unfiltered per-type counts for the filter chips. */
  typeCounts: Map<DeviceTypeKey, number>;
  /** Unfiltered fleet size. */
  total: number;
  /** Unfiltered connection tally for the header summary. */
  connectionCounts: ConnectionCounts;
  summaryLoading: boolean;
  assetNameOf: (device: Device) => string | null;
  loading: boolean;
  error: string | null;
  hasFilters: boolean;
};

/** Data layer of the devices list page. The table keeps server-side
 *  filtering (URL params → `GET /devices`); chip counts and the header
 *  summary come from a second, unfiltered fetch that shares the
 *  `["devices", undefined]` cache the sidebar keeps warm. */
export function useDevicesPage(): DevicesPage {
  const filter = useFilterParams();
  const [searchParams] = useSearchParams();
  const otherSelected = searchParams.get("type") === OTHER_KEY;

  // `other` is a UI bucket, not a wire type: the server cannot express
  // "type outside the standard enum", so the type criterion is dropped
  // from the server filter and re-applied client-side below.
  const serverFilter = useMemo(() => {
    if (!otherSelected || !filter) return filter;
    const rest: DevicesFilter = { ...filter };
    delete rest.types;
    return Object.keys(rest).length === 0 ? undefined : rest;
  }, [filter, otherSelected]);

  const { devices: fetched, loading, error } = useDevicesList(serverFilter);
  const { devices: allDevices, loading: summaryLoading } = useDevicesList();
  const { assetsById } = useAssetTree();

  const groups = useMemo(() => {
    const tableDevices = otherSelected
      ? fetched.filter((device) => deviceTypeKey(device) === OTHER_KEY)
      : fetched;
    return groupDevicesByType(tableDevices);
  }, [fetched, otherSelected]);

  const typeCounts = useMemo(
    () => countDevicesByType(allDevices),
    [allDevices],
  );
  const connectionCounts = useMemo(
    () => countByConnectionStatus(allDevices),
    [allDevices],
  );

  const assetNameOf = (device: Device): string | null => {
    const assetId = device.tags?.["asset_id"];
    return assetId ? (assetsById[assetId]?.name ?? null) : null;
  };

  return {
    groups,
    typeCounts,
    total: allDevices.length,
    connectionCounts,
    summaryLoading,
    assetNameOf,
    loading,
    error,
    hasFilters: !!filter,
  };
}

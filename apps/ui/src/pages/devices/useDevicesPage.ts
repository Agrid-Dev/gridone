import { useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Asset, Device } from "@gridone/sdk";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useAssetTree } from "@/hooks/useAssetTree";
import { zonePathOf as assetZonePath } from "@/lib/assets";
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
  /** Name of the asset a device is attached to — the table's Zone column. */
  assetNameOf: (device: Device) => string | null;
  /** Full placement of a device ("Floor 2 · Room 201") — the card subtitle,
   *  which has the room to carry the whole chain. */
  zonePathOf: (device: Device) => string | null;
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

  const assetOf = (device: Device): Asset | null => {
    const assetId = device.tags?.["asset_id"];
    return assetId ? (assetsById[assetId] ?? null) : null;
  };

  const assetNameOf = (device: Device): string | null =>
    assetOf(device)?.name ?? null;

  const zonePathOf = (device: Device): string | null => {
    const asset = assetOf(device);
    if (!asset) return null;
    // An asset outside the floor/room/zone chain (a device tagged straight to
    // the building) still deserves a label: fall back to its own name.
    return assetZonePath(asset, assetsById) || asset.name;
  };

  return {
    groups,
    typeCounts,
    total: allDevices.length,
    connectionCounts,
    summaryLoading,
    assetNameOf,
    zonePathOf,
    loading,
    error,
    hasFilters: !!filter,
  };
}

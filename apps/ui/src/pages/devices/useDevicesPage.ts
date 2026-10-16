import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Device, DeviceFacets, DeviceListParams } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useDevicesCount } from "@/hooks/useDevicesCount";
import {
  useFilterParams,
  usePageParam,
  type Health,
} from "@/hooks/useFilterParams";
import { useDeviceZonePath } from "@/hooks/useDeviceZonePath";
import { devicesFilterToListParams, type DevicesFilter } from "@/lib/devices";
import {
  deviceTypeCounts,
  groupDevicesInOrder,
  isDeviceTypeKey,
  type DeviceTypeGroup,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";
import type { ConnectionCounts } from "@/lib/deviceSummary";
import { toSearchString } from "@/lib/pagination";

/** Devices per page of the list; the API serves up to 500. */
export const DEVICES_PAGE_SIZE = 100;

export type HealthCounts = Record<Exclude<Health, "all">, number>;

type DevicesPage = {
  /** Type buckets of the current page, in the server's order. */
  groups: DeviceTypeGroup[];
  /** Per-type counts over every device the filters match. */
  typeCounts: Map<DeviceTypeKey, number>;
  /** Unfiltered fleet size. */
  total: number;
  /** Faulty and healthy counts over every device the filters match. */
  healthCounts: HealthCounts;
  /** Devices the filters match, across pages; null while the page is
   *  loading or failed, so no count passes for an empty result. */
  shown: number | null;
  /** Type buckets selected by the filter, as parsed from the URL. */
  selectedTypes: DeviceTypeKey[];
  /** Fault criterion selected by the filter. */
  health: Health;
  /** Connection tally over every device the filters match. */
  connectionCounts: ConnectionCounts;
  summaryLoading: boolean;
  /** Full placement of a device ("Floor 2 · Room 201") — the card subtitle,
   *  which has the room to carry the whole chain. */
  zonePathOf: (device: Device) => string | null;
  loading: boolean;
  error: string | null;
  hasFilters: boolean;
  page: number;
  totalPages: number;
  /** Route search strings of the neighbouring pages, undefined while the
   *  page shown is a placeholder for the one being fetched. */
  prevHref: string | undefined;
  nextHref: string | undefined;
};

const NO_FACETS: DeviceFacets = {
  type: {},
  health: { healthy: 0, faulty: 0 },
  connection_status: { idle: 0, ok: 0, degraded: 0, error: 0 },
};

/** Data layer of the devices list page: one page of `GET /devices` for the
 *  URL's filters and page, in type order, with the facets the server counts
 *  over the whole match feeding the filter chips and the summary. The fleet
 *  total comes from the count the sidebar keeps warm. */
export function useDevicesPage(): DevicesPage {
  const { t } = useTranslation("devices");
  const client = useGridoneClient();
  const filter = useFilterParams();
  const page = usePageParam();
  const selectedTypes = useMemo(
    () => (filter?.types ?? []).filter(isDeviceTypeKey),
    [filter],
  );

  const params = useMemo<DeviceListParams>(
    () => ({
      ...devicesFilterToListParams(filter),
      page,
      size: DEVICES_PAGE_SIZE,
      sort_by: "type",
    }),
    [filter, page],
  );
  const query = useQuery({
    queryKey: ["devices", "page", params],
    queryFn: () => client.devices.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
  const { count: total, loading: summaryLoading } = useDevicesCount();
  const zonePathOf = useDeviceZonePath();

  const data = query.data;
  const groups = useMemo(() => groupDevicesInOrder(data?.items ?? []), [data]);
  const facets = data?.facets ?? NO_FACETS;
  const typeCounts = useMemo(() => deviceTypeCounts(facets.type), [facets]);
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : t("devices.unableToLoad")
    : null;
  const settled = data !== undefined && !query.isPlaceholderData;

  return {
    groups,
    typeCounts,
    total,
    healthCounts: facets.health,
    shown: data && !error ? data.total : null,
    selectedTypes,
    health: healthOf(filter),
    connectionCounts: facets.connection_status,
    summaryLoading,
    zonePathOf,
    loading: query.isLoading,
    error,
    hasFilters: !!filter,
    page: data?.page ?? page,
    totalPages: data?.total_pages ?? 0,
    prevHref: settled ? toSearchString(data.links.prev ?? null) : undefined,
    nextHref: settled ? toSearchString(data.links.next ?? null) : undefined,
  };
}

function healthOf(filter: DevicesFilter | undefined): Health {
  if (filter?.is_faulty == null) return "all";
  return filter.is_faulty ? "faulty" : "healthy";
}

import { useQuery } from "@tanstack/react-query";
import type {
  AttributeCoverage,
  AttributeCoverageResponse,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  devicesFilterToListParams,
  isEmptyFilter,
  type DevicesFilter,
} from "@/lib/devices";

export type UseAttributeCoverageResult = {
  /** Union of attributes over the matched device set, with per-attribute
   *  counts. Empty while loading or when the query is disabled. */
  coverage: AttributeCoverage[];
  /** Size of the matched device set — the denominator for coverage. */
  totalDevices: number;
  isLoading: boolean;
  error: Error | null;
};

/** Attribute coverage over the device set matched by *filter*
 *  (``GET /devices/attributes``). */
export function useAttributeCoverage(
  filter: DevicesFilter,
  opts?: { enabled?: boolean },
): UseAttributeCoverageResult {
  const client = useGridoneClient();
  const params = devicesFilterToListParams(filter);

  const { data, isLoading, error } = useQuery<AttributeCoverageResponse>({
    queryKey: ["device-attributes", params],
    queryFn: () => client.devices.listAttributes(params),
    enabled: opts?.enabled ?? true,
  });

  return {
    coverage: data?.attributes ?? [],
    totalDevices: data?.total_devices ?? 0,
    isLoading,
    error,
  };
}

/** Devices matched by *filter* that don't expose *attribute* — absent from
 *  coverage entirely (not just a lower count) means zero matched devices
 *  expose it, so the whole set would be skipped at render. */
export function useSkippedDeviceCount(
  filter: DevicesFilter,
  attribute: string | undefined,
): { skipped: number; totalDevices: number } {
  const { coverage, totalDevices } = useAttributeCoverage(filter, {
    enabled: !isEmptyFilter(filter),
  });
  const selectedCoverage = coverage.find((c) => c.attribute === attribute);
  const skipped = attribute
    ? totalDevices - (selectedCoverage?.device_count ?? 0)
    : 0;
  return { skipped, totalDevices };
}

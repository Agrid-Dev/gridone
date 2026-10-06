import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { ChartWidgetConfig, Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams } from "@/lib/devices";

/** The persisted target shape a chart widget stores a list of. */
export type AttributeTarget = ChartWidgetConfig["targets"][number];

/** True when the criteria select on no dimension. An empty filter matches
 *  every device server-side, but "everything" is never an intentional target —
 *  it resolves to nothing here, mirroring the editor's validation. */
export function isEmptyTarget(devices: AttributeTarget["devices"]): boolean {
  return (
    !devices.ids?.length &&
    !devices.types?.length &&
    Object.keys(devices.tags ?? {}).length === 0
  );
}

type TargetDevices = {
  /** Each target's device set, in the order the targets were given. */
  devices: Device[][];
  isLoading: boolean;
  error: Error | null;
};

/** Declared at module level: a stable `combine` is what lets React Query keep
 *  the combined result's identity between renders. */
function combineTargetDevices(
  results: UseQueryResult<Device[]>[],
): TargetDevices {
  return {
    devices: results.map((r) => r.data ?? []),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
  };
}

/**
 * Resolve attribute targets to their device sets, at render time.
 *
 * Each target's criteria go to `GET /devices` along with its attribute, so the
 * server keeps the devices that expose it — the result is exactly the series
 * set to plot. Criteria targets are dynamic: re-resolved on each view (and on
 * the caller's poll cadence), so a device re-tagged after the widget was saved
 * joins or leaves the chart without editing it.
 */
export function useTargetDevices(
  targets: AttributeTarget[],
  refetchInterval: number | false = false,
): TargetDevices {
  const client = useGridoneClient();

  return useQueries({
    queries: targets.map((target) => {
      const params = {
        ...devicesFilterToListParams(target.devices),
        attribute: target.attribute,
      };
      return {
        queryKey: ["devices", params],
        queryFn: () => client.devices.list(params),
        enabled: !isEmptyTarget(target.devices) && !!target.attribute,
        refetchInterval,
      };
    }),
    combine: combineTargetDevices,
  });
}

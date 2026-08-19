import { useQuery } from "@tanstack/react-query";
import type { ChartWidgetConfig, Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams } from "@/lib/devices";

/** The persisted target shape a chart widget stores. */
export type AttributeTarget = ChartWidgetConfig["target"];

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

/**
 * Resolve an attribute target to its device set, at render time.
 *
 * The criteria go to `GET /devices` along with the target's attribute, so the
 * server keeps the devices that expose it — the result is exactly the series
 * set to plot. Criteria targets are dynamic: re-resolved on each view (and on
 * the caller's poll cadence), so a device re-tagged after the widget was saved
 * joins or leaves the chart without editing it.
 */
export function useTargetDevices(
  target: AttributeTarget,
  refetchInterval: number | false = false,
): { devices: Device[]; isLoading: boolean; error: Error | null } {
  const client = useGridoneClient();

  const enabled = !isEmptyTarget(target.devices) && !!target.attribute;
  const params = {
    ...devicesFilterToListParams(target.devices),
    attribute: target.attribute,
  };

  const query = useQuery<Device[]>({
    queryKey: ["devices", params],
    queryFn: () => client.devices.list(params),
    enabled,
    refetchInterval,
  });

  return {
    devices: query.data ?? [],
    isLoading: enabled && query.isLoading,
    error: query.error ?? null,
  };
}

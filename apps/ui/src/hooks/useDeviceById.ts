import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/**
 * Fetch one device by id, anywhere in the app.
 *
 * Unlike `useDevice`, this needs no `DeviceProvider` — it is for the places
 * that reference a device without being scoped to one (pickers, dashboard
 * widgets), where that context doesn't exist.
 *
 * The key is singular on purpose: `["devices", undefined]` collides with
 * `useDevicesList`'s cache, and `enabled: false` does not stop react-query from
 * serving data already cached under that key.
 */
export function useDeviceById(
  deviceId: string | undefined,
): UseQueryResult<Device> {
  const client = useGridoneClient();
  return useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => client.devices.get(deviceId!),
    enabled: !!deviceId,
  });
}

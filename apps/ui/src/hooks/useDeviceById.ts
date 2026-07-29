import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/**
 * Find a device in any cached `["devices", filter]` list, with the age of the
 * list it came from.
 *
 * A page that has already listed devices holds the one being asked for, so
 * seeding from it renders immediately instead of showing a placeholder while a
 * request fetches what is on screen already. The age travels with it so
 * react-query still refetches on its own terms — a device carried over from a
 * stale list is not treated as fresh.
 */
export function findDeviceInCachedLists(
  queryClient: QueryClient,
  deviceId: string,
): { device: Device; updatedAt: number } | undefined {
  for (const [key, devices] of queryClient.getQueriesData<Device[]>({
    queryKey: ["devices"],
  })) {
    const device = devices?.find((d) => d.id === deviceId);
    if (device) {
      return {
        device,
        updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
      };
    }
  }
  return undefined;
}

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
  const queryClient = useQueryClient();
  const cached = () =>
    deviceId ? findDeviceInCachedLists(queryClient, deviceId) : undefined;

  return useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => client.devices.get(deviceId!),
    enabled: !!deviceId,
    initialData: () => cached()?.device,
    initialDataUpdatedAt: () => cached()?.updatedAt,
  });
}

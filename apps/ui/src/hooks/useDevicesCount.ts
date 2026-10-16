import { useQuery } from "@tanstack/react-query";
import type { DeviceFilterParams } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** How many devices match the filters, read off the smallest page the API
 *  serves: a count costs one device, not the fleet. Shares the `["devices"]`
 *  key prefix, so every device mutation invalidates it too. */
export function useDevicesCount(params?: DeviceFilterParams) {
  const client = useGridoneClient();
  const { data, isLoading } = useQuery({
    queryKey: ["devices", "count", params],
    queryFn: () => client.devices.list({ ...params, size: 1 }),
    select: (page) => page.total,
    refetchInterval: 10_000,
  });

  return { count: data ?? 0, loading: isLoading };
}

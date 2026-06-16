import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useParams } from "react-router";
import { getDevice, Device } from "../api/devices";
import { useDeviceContext } from "../contexts/DeviceContext";

export function useDevice(deviceId: string | undefined) {
  const { isConnected } = useDeviceContext();
  return useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: () => {
      if (!deviceId) {
        throw new Error("Device ID is required");
      }
      return getDevice(deviceId);
    },
    enabled: !!deviceId,
    refetchInterval: isConnected ? false : 15000,
  });
}

export function useDeviceFromRoute(): Device {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { isConnected } = useDeviceContext();
  const queryClient = useQueryClient();
  if (!deviceId) {
    throw new Error("useDeviceFromRoute requires a 'deviceId' route param");
  }
  // Look up the device in any cached `["devices", filter]` list.
  const cachedFromList = ():
    | { device: Device; updatedAt: number }
    | undefined => {
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
  };
  const { data } = useSuspenseQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: () => getDevice(deviceId),
    initialData: () => cachedFromList()?.device,
    initialDataUpdatedAt: () => cachedFromList()?.updatedAt,
    refetchInterval: isConnected ? false : 15000,
  });
  return data;
}

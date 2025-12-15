import { useQuery } from "@tanstack/react-query";
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

import { useQuery } from "@tanstack/react-query";
import { getDevice, Device } from "../api/devices";

export function useDevice(deviceId: string | undefined) {
  return useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: () => {
      if (!deviceId) {
        throw new Error("Device ID is required");
      }
      return getDevice(deviceId);
    },
    enabled: !!deviceId,
  });
}


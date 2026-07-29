import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { findDeviceInCachedLists } from "./useDeviceById";
import { useDeviceContext } from "../contexts/DeviceContext";

export function useDevice(deviceId: string | undefined) {
  const client = useGridoneClient();
  const { isConnected } = useDeviceContext();
  return useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: () => {
      if (!deviceId) {
        throw new Error("Device ID is required");
      }
      return client.devices.get(deviceId);
    },
    enabled: !!deviceId,
    refetchInterval: isConnected ? false : 15000,
  });
}

export function useDeviceFromRoute(): Device {
  const client = useGridoneClient();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { isConnected } = useDeviceContext();
  const queryClient = useQueryClient();
  if (!deviceId) {
    throw new Error("useDeviceFromRoute requires a 'deviceId' route param");
  }
  const cachedFromList = () => findDeviceInCachedLists(queryClient, deviceId);
  const { data } = useSuspenseQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: () => client.devices.get(deviceId),
    initialData: () => cachedFromList()?.device,
    initialDataUpdatedAt: () => cachedFromList()?.updatedAt,
    refetchInterval: isConnected ? false : 15000,
  });
  return data;
}

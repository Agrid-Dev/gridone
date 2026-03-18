import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Device, listDevices } from "../api/devices";
import { useDeviceContext } from "../contexts/DeviceContext";

export function useDevicesList(filters?: Record<string, string>) {
  const { t } = useTranslation();
  const { isConnected } = useDeviceContext();

  const {
    data,
    isLoading,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery<Device[]>({
    queryKey: ["devices", filters],
    queryFn: () => listDevices(filters),
    refetchInterval: isConnected ? false : 15000,
    staleTime: 5000,
  });

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t("devices.unableToLoad")
    : null;

  return {
    devices: data ?? [],
    loading: isLoading,
    error,
    refreshing: isFetching && !isLoading,
    fetchDevices: refetch,
  };
}

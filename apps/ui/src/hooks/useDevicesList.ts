import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Device, listDevices } from "../api/devices";

export function useDevicesList(filters?: Record<string, string>) {
  const { t } = useTranslation();

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Device[]>({
    queryKey: ["devices", filters],
    queryFn: () => listDevices(filters),
    refetchInterval: 10_000,
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
  };
}

import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Device, DevicesFilter, listDevices } from "../api/devices";

export function useDevicesList(filter?: DevicesFilter) {
  const { t } = useTranslation("devices");

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Device[]>({
    queryKey: ["devices", filter],
    queryFn: () => listDevices(filter),
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

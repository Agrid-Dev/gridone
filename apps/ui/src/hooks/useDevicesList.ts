import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams, type DevicesFilter } from "@/lib/devices";

export function useDevicesList(filter?: DevicesFilter) {
  const { t } = useTranslation("devices");
  const client = useGridoneClient();

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Device[]>({
    queryKey: ["devices", filter],
    queryFn: () => client.devices.list(devicesFilterToListParams(filter)),
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

import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams, type DevicesFilter } from "@/lib/devices";
import {
  FLEET_ATTRIBUTES,
  FLEET_KEY,
} from "@/pages/devices/standard-devices/fleetAttributes";

/** The devices a fleet view lists, each with only what its card reads: its
 *  `FLEET_ATTRIBUTES` and its faults, without write contracts or
 *  descriptions. On a site of 376 thermostats that is 0.7 MB a refresh
 *  instead of 117 MB for the full list. */
export function useDeviceFleet(
  filter?: DevicesFilter,
  { refetchInterval = 10_000 }: { refetchInterval?: number } = {},
) {
  const { t } = useTranslation("devices");
  const client = useGridoneClient();

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Device[]>({
    queryKey: ["devices", FLEET_KEY, filter],
    queryFn: () =>
      client.devices.list({
        ...devicesFilterToListParams(filter),
        include_attributes: [...FLEET_ATTRIBUTES],
        include_attribute_kinds: ["fault"],
      }),
    refetchInterval,
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

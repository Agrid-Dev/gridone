import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import {
  OTHER_KEY,
  deviceTypeLabel,
  uniformDeviceTypeKey,
} from "@/lib/deviceTypes";

/**
 * How many devices, said in business vocabulary: "8 thermostats" when they
 * all share one known type, "8 équipements" otherwise — never "8 autres".
 *
 * One phrasing for every place that counts a set of devices, from the same
 * catalog the fleet views use (AGR-1029).
 */
export function useDeviceCountLabel() {
  const { t } = useTranslation("devices");
  const { t: tTypes } = useTranslation("standardDevices");
  return useCallback(
    (devices: readonly Device[]) => {
      const key = uniformDeviceTypeKey(devices);
      return key && key !== OTHER_KEY
        ? t("groups.deviceCount", {
            total: devices.length,
            type: deviceTypeLabel(key, devices.length, tTypes),
          })
        : t("groups.equipmentCount", { count: devices.length });
    },
    [t, tTypes],
  );
}

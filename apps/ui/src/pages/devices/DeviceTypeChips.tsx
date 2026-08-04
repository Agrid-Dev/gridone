import { useTranslation } from "react-i18next";
import { TypeFilterChips } from "@/components/TypeFilterChips";
import {
  DEVICE_TYPE_ORDER,
  deviceTypeBucketLabel,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";

type DeviceTypeChipsProps = {
  /** Unfiltered per-type counts — chips render for non-empty buckets only. */
  counts: Map<DeviceTypeKey, number>;
  total: number;
};

/** One filter chip per device-type bucket present in the fleet ("Tous 49",
 *  "Thermostats 42", …), driving the `?type=` query param. */
export function DeviceTypeChips({ counts, total }: DeviceTypeChipsProps) {
  const { t } = useTranslation("devices");
  const { t: tTypes } = useTranslation("standardDevices");

  const options = DEVICE_TYPE_ORDER.filter(
    (key) => (counts.get(key) ?? 0) > 0,
  ).map((key) => ({
    key,
    label: deviceTypeBucketLabel(key, tTypes),
    count: counts.get(key) ?? 0,
  }));

  return (
    <TypeFilterChips
      options={options}
      total={total}
      allLabel={t("devices.filters.all")}
      ariaLabel={t("devices.filters.label")}
    />
  );
}

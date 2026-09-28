import { useTranslation } from "react-i18next";
import {
  deviceTypeBucketLabel,
  deviceTypeKeyIcon,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";

/** The label and count of one fleet type bucket ("Thermostats 42"). */
export function DeviceGroupHeading({
  typeKey,
  count,
  id,
}: {
  typeKey: DeviceTypeKey;
  count: number;
  /** Set by the grid so its section can be labelled by this heading. */
  id?: string;
}) {
  const { t: tTypes } = useTranslation("standardDevices");
  const Icon = deviceTypeKeyIcon(typeKey);

  return (
    <span
      id={id}
      className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {deviceTypeBucketLabel(typeKey, tTypes)}
      <span className="tabular-nums">{count}</span>
    </span>
  );
}

import { useTranslation } from "react-i18next";
import {
  deviceTypeBucketLabel,
  deviceTypeKeyIcon,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";

/** The label of one type bucket ("Thermostats 42"), shared by both fleet
 *  views so a bucket reads identically as a table row and as a grid section
 *  heading. The chrome around it (row, rule) belongs to the caller. */
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

import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { FaultSeverityIcon } from "@/components/FaultSeverityIcon";
import { getActiveFaults } from "@/lib/faults";
import type { Device } from "@gridone/sdk";

/** Compact device-health badge: the active-fault count, coloured by the
 *  highest active severity. Renders nothing when the device has no active
 *  faults. Shared by the device header (AGR-745) and the device list. */
export function DeviceFaultBadge({ device }: { device: Device }) {
  const { t } = useTranslation("devices");
  const faults = getActiveFaults(device);
  if (faults.length === 0) return null;

  // getActiveFaults sorts most-severe first, so [0] is the highest severity.
  const severity = faults[0].severity;

  return (
    <Badge
      variant="outline"
      data-severity={severity}
      className="gap-1"
      title={t("deviceDetails.activeFaults.badge", { count: faults.length })}
    >
      <FaultSeverityIcon severity={severity} className="h-3.5 w-3.5" />
      {faults.length}
    </Badge>
  );
}

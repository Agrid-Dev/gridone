import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { Card } from "@/components/ui";
import { ConnectionStatusDot } from "@/components/ConnectionStatusBadge";
import { EmptyValue } from "@/components/EmptyValue";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { getConnectionStatus } from "@/lib/devices";
import {
  deviceMeasureReading,
  deviceSetpointReading,
  formatReading,
  formatReadingDelta,
} from "@/lib/deviceSummary";
import { activeFaultSummary } from "@/lib/faults";
import { SEVERITY_TEXT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";
import { DeviceModeValue } from "./DeviceModeValue";
import { DeviceSparkline } from "./DeviceSparkline";

/** Border tint per active severity — the card outline is the first thing
 *  scanned in a grid of dozens, so a faulty device reads before its label. */
const CARD_SEVERITY_CLASS = {
  alert: "border-status-error/50",
  warning: "border-status-warning/50",
  info: "border-status-info/50",
} as const;

/**
 * One device of the fleet grid: identity and location, the primary measure
 * with its distance from setpoint and last-day trend, then operating mode and
 * fault state. The grid counterpart of {@link DeviceRow} — same summary
 * helpers, laid out for scanning rather than for comparing columns.
 */
export function DeviceFleetCard({
  device,
  zonePath,
}: {
  device: Device;
  zonePath: string | null;
}) {
  const { t, i18n } = useTranslation(["devices", "common"]);
  const [ref, inView] = useInViewOnce<HTMLAnchorElement>({
    rootMargin: "200px",
  });

  const status = getConnectionStatus(device);
  const measure = deviceMeasureReading(device);
  const setpoint = deviceSetpointReading(device);
  const delta = formatReadingDelta(measure, setpoint, i18n.language);
  const faults = activeFaultSummary(device);

  return (
    <Link ref={ref} to={`/devices/${device.id}`} className="group block h-full">
      <Card
        className={cn(
          "flex h-full flex-col gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          faults && CARD_SEVERITY_CLASS[faults.severity],
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-sm font-semibold text-card-foreground">
              {device.name || device.id}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {zonePath ?? <EmptyValue />}
            </p>
          </div>
          <ConnectionStatusDot status={status} className="mt-1.5 shrink-0" />
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-0">
            <span className="font-display text-2xl font-semibold tabular-nums text-card-foreground">
              {formatReading(measure, i18n.language)}
            </span>
            {delta && (
              <span className="ml-2 truncate text-xs text-muted-foreground">
                {t("devices.card.vsSetpoint", { delta })}
              </span>
            )}
          </div>
          <div className="ml-auto w-20 shrink-0">
            {inView && measure && (
              <DeviceSparkline
                deviceId={device.id}
                metric={measure.metric}
                label={t("devices.card.trendLabel")}
              />
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2 border-t pt-2.5 text-xs">
          <DeviceModeValue device={device} />
          <span className="ml-auto truncate">
            {faults ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-medium",
                  SEVERITY_TEXT_CLASS[faults.severity],
                )}
              >
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t(`common:common.severityCount.${faults.severity}`, {
                  count: faults.count,
                })}
              </span>
            ) : (
              <span className="text-muted-foreground">
                {t("devices.card.noFault")}
              </span>
            )}
          </span>
        </div>
      </Card>
    </Link>
  );
}

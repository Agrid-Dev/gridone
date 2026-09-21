import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { Card } from "@/components/ui";
import { ConnectionStatusValue } from "@/components/ConnectionStatusBadge";
import { EmptyValue } from "@/components/EmptyValue";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { getConnectionStatus, isPmsMonitor } from "@/lib/devices";
import {
  deviceMeasureReading,
  deviceSetpointReading,
  formatReading,
} from "@/lib/deviceSummary";
import { activeFaultSummary } from "@/lib/faults";
import { cn } from "@/lib/utils";
import { DeviceModeValue } from "./DeviceModeValue";
import { DeviceSparkline } from "./DeviceSparkline";
import { PmsMonitorFleetSummary } from "./PmsMonitorFleetSummary";
import { getStandardDeviceEntry } from "./standard-devices/registry";

/** Border tint per active severity — the card outline is the first thing
 *  scanned in a grid of dozens, so a faulty device reads before its label. */
const CARD_SEVERITY_CLASS = {
  alert: "border-status-error/50",
  warning: "border-status-warning/50",
  info: "border-status-info/50",
} as const;

/**
 * One device of the fleet grid: identity and location, the setpoint (or the
 * primary measure when there is no setpoint) with the live reading beside it
 * and last-day trend, then operating mode and fault state. The grid
 * counterpart of {@link DeviceRow} — same summary helpers, laid out for
 * scanning rather than for comparing columns.
 */
export function DeviceFleetCard({
  device,
  zonePath,
}: {
  device: Device;
  zonePath: string | null;
}) {
  const { t, i18n } = useTranslation(["devices", "common"]);
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    rootMargin: "200px",
  });

  const { open } = useResourceNavigation();
  const status = getConnectionStatus(device);
  const canSeeConnectionStatus = useCanSeeConnectionStatus();
  const measure = deviceMeasureReading(device);
  const setpoint = deviceSetpointReading(device);
  const lead = setpoint?.value != null ? setpoint : measure;
  const showMeasuredBeside = setpoint?.value != null && measure?.value != null;
  const faults = activeFaultSummary(device);
  const isPms = isPmsMonitor(device);
  // Types whose state is not a number lead with their own summary instead of
  // the measure + sparkline, and say nothing more in the mode row.
  const FleetSummary = getStandardDeviceEntry(device.type)?.FleetSummary;
  const hasVerdictSummary = isPms || Boolean(FleetSummary);

  return (
    <div ref={ref} className="group block h-full">
      <Card
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("a,button,input"))
            open(`/devices/${device.id}`);
        }}
        className={cn(
          "flex h-full flex-col gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          faults && CARD_SEVERITY_CLASS[faults.severity],
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-sm font-semibold text-card-foreground">
              <Link
                to={`/devices/${device.id}`}
                className="inline-flex items-center gap-1"
              >
                {device.name || device.id}
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {zonePath ?? <EmptyValue />}
            </p>
          </div>
          {canSeeConnectionStatus && (
            <span className="text-xs">
              <ConnectionStatusValue status={status} />
            </span>
          )}
        </div>

        {isPms ? (
          <PmsMonitorFleetSummary device={device} />
        ) : FleetSummary ? (
          <FleetSummary device={device} />
        ) : (
          <div className="flex items-end gap-3">
            <div className="min-w-0">
              <span className="font-display text-2xl font-semibold tabular-nums text-card-foreground">
                {formatReading(lead, i18n.language)}
              </span>
              {showMeasuredBeside && (
                <span className="ml-2 truncate text-xs text-muted-foreground">
                  {t("devices.card.measured", {
                    value: formatReading(measure, i18n.language),
                  })}
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
        )}

        <div className="mt-auto flex items-center gap-2 border-t pt-2.5 text-xs">
          {!hasVerdictSummary && <DeviceModeValue device={device} />}
          <span className="ml-auto truncate">
            {faults ? (
              <DeviceFaultBadge device={device} />
            ) : (
              <span className="text-muted-foreground">
                {t("devices.card.noFault")}
              </span>
            )}
          </span>
        </div>
      </Card>
    </div>
  );
}

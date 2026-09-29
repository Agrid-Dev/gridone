import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { ResourceLink as Link } from "@/components/ResourceLink";
import type { Device } from "@gridone/sdk";
import { Card } from "@/components/ui";
import { ConnectionStatusDot } from "@/components/ConnectionStatusBadge";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { getConnectionStatus } from "@/lib/devices";
import { activeFaultSummary } from "@/lib/faults";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { FleetLeadView } from "./standard-devices/FleetLeadView";
import { FleetRunStatusLine } from "./standard-devices/FleetRunStatusLine";
import { FleetTypeTile } from "./standard-devices/FleetTypeTile";
import { getFleetLead, getFleetStatus } from "./standard-devices/registry";

/** Border tint per active severity — the card outline is the first thing
 *  scanned in a grid of dozens, so a faulty device reads before its label. */
const CARD_SEVERITY_CLASS = {
  alert: "border-status-error/50",
  warning: "border-status-warning/50",
  info: "border-status-info/50",
} as const;

/**
 * One device of the fleet grid: its type tile, name and location, then the
 * lead from the standard-device registry, and a status line with the unit's
 * mode or run state and the fault badge when either applies.
 */
export function DeviceFleetCard({
  device,
  zonePath,
}: {
  device: Device;
  zonePath: string | null;
}) {
  const connection = getConnectionStatus(device);
  const canSeeConnectionStatus = useCanSeeConnectionStatus();
  const faults = activeFaultSummary(device);
  const { t, i18n } = useTranslation(["devices", "standardDevices"]);
  const lead = getFleetLead(device.type)(device, { t, locale: i18n.language });
  const { activity, runStatus } = getFleetStatus(device.type)(device);

  return (
    <div className="group block h-full">
      <Card
        className={cn(
          "relative flex h-full flex-col gap-3.5 p-4 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          faults && CARD_SEVERITY_CLASS[faults.severity],
        )}
      >
        <div className="flex items-start gap-3">
          <FleetTypeTile device={device} activity={activity} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 break-words font-display text-sm font-semibold text-card-foreground">
              {/* Stretched link: its overlay makes the whole card one real
                  link (keyboard, new tab, copy link) with no click handler. */}
              <Link
                to={`/devices/${device.id}`}
                className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {device.name || device.id}
              </Link>
            </h3>
            {zonePath && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {zonePath}
              </p>
            )}
          </div>
          {/* Centred on the title's first line (text-sm: 20px leading). */}
          {canSeeConnectionStatus && (
            <ConnectionStatusDot
              status={connection}
              className="mt-1.5 shrink-0"
            />
          )}
        </div>

        <FleetLeadView lead={lead} muted={activity === "idle"} />

        {(runStatus || faults) && (
          <div className="mt-auto flex items-center gap-3 border-t border-muted pt-3">
            {runStatus && <FleetRunStatusLine status={runStatus} />}
            {faults && (
              // Above the stretched link, so the badge keeps its own target.
              <span className="relative z-10 ml-auto shrink-0">
                <DeviceFaultBadge device={device} />
              </span>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

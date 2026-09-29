import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { ResourceLink as Link } from "@/components/ResourceLink";
import type { Device } from "@gridone/sdk";
import { Card } from "@/components/ui";
import { ConnectionStatusValue } from "@/components/ConnectionStatusBadge";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { deviceTypeName, OTHER_KEY } from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { fleetCardStatus, type FleetOutline } from "./fleetCardStatus";
import { FleetLeadView } from "./standard-devices/FleetLeadView";
import { FleetRunStatusLine } from "./standard-devices/FleetRunStatusLine";
import { FleetTypeTile } from "./standard-devices/FleetTypeTile";
import { getFleetLead } from "./standard-devices/registry";

/** The outline's colour — the card outline is the first thing scanned in a
 *  grid of dozens: green says a unit runs, a fault's severity wins over it.
 *  Coloured outlines are 1.5 px (the border plus a 0.5 px ring), so they read
 *  over the neutral hairline without moving the card's content. Literal
 *  classes so Tailwind keeps them. */
const OUTLINE_CLASS: Record<FleetOutline, { border: string; ring: string }> = {
  running: { border: "border-status-ok/60", ring: "ring-status-ok/60" },
  alert: { border: "border-status-error/60", ring: "ring-status-error/60" },
  warning: {
    border: "border-status-warning/60",
    ring: "ring-status-warning/60",
  },
  info: { border: "border-status-info/60", ring: "ring-status-info/60" },
};

/**
 * One device of the fleet grid: its type tile, name, type and location, the
 * lead from the standard-device registry, and a status line with the unit's
 * mode or run state and the fault badge when either applies. The outline
 * says whether the unit runs (green) or has a fault (its severity); a
 * disconnected device is dashed, its last values greyed, and says so beside
 * its name.
 */
export function DeviceFleetCard({
  device,
  zonePath,
}: {
  device: Device;
  zonePath: string | null;
}) {
  const canSeeConnectionStatus = useCanSeeConnectionStatus();
  const { t, i18n } = useTranslation(["devices", "standardDevices"]);
  const { t: tTypes } = useTranslation("standardDevices");
  const lead = getFleetLead(device.type)(device, { t, locale: i18n.language });
  const { activity, runStatus, connection, stale, faults, outline } =
    fleetCardStatus(device, canSeeConnectionStatus);
  const typeLabel =
    deviceTypeName(device.type, tTypes) ?? tTypes(`${OTHER_KEY}.name`);

  return (
    <div className="group block h-full">
      <Card
        data-outline={outline ?? undefined}
        className={cn(
          "relative flex h-full flex-col gap-3.5 p-4 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
          outline && OUTLINE_CLASS[outline].border,
          // A dashed line cannot take the solid ring: a stale card keeps 1 px.
          stale
            ? ["border-dashed", !outline && "border-muted-foreground/40"]
            : outline && ["ring-[0.5px]", OUTLINE_CLASS[outline].ring],
        )}
      >
        <div className="flex items-start gap-3">
          <FleetTypeTile device={device} activity={activity} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3 className="line-clamp-2 min-w-0 flex-1 break-words font-display text-sm font-semibold text-card-foreground">
                {/* Stretched link: its overlay makes the whole card one real
                    link (keyboard, new tab, copy link) with no click handler. */}
                <Link
                  to={`/devices/${device.id}`}
                  className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {device.name || device.id}
                </Link>
              </h3>
              {/* On the name's line only (text-sm: 20px leading), so the
                  type and location below keep the full width. */}
              {connection && (
                <ConnectionStatusValue
                  status={connection}
                  withIcon
                  className="shrink-0 whitespace-nowrap text-xs leading-5"
                />
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">
                {typeLabel}
              </span>
              {zonePath && ` · ${zonePath}`}
            </p>
          </div>
        </div>

        <FleetLeadView lead={lead} muted={activity === "idle"} stale={stale} />

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

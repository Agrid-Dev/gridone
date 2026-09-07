import { useMemo, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import type { Device } from "@gridone/sdk";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFaultsList } from "@/hooks/useFaultsList";
import { SEVERITY_TEXT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";
import type { LevelSummary } from "./levelSummaries";
import type { RoomState } from "./roomStates";
import {
  buildViewerAlerts,
  hasNothingToShow,
  type AlertRoomGroup,
  type ViewerAlerts,
} from "./viewerAlerts";

/**
 * Every active fault of the building, behind one chip.
 *
 * The chip counts *zones* in alert, which is the sum of the levels panel's
 * per-level badges — one number that cannot drift from the rail beside it.
 * Warnings are listed but never inflate that headline, and faults on devices
 * the model cannot place are reported at the foot rather than dropped.
 *
 * The list is frozen while the popover is open: the fault query refetches
 * every 10s, and rows must not move under the pointer mid-click.
 */
export const AlertsChip: FC<{
  devices: Device[];
  roomStates: Map<string, RoomState>;
  levels: LevelSummary[];
  onFocusRoom: (globalId: string, deviceId: string) => void;
}> = ({ devices, roomStates, levels, onFocusRoom }) => {
  const { t } = useTranslation("home");
  const { faults } = useFaultsList();
  const [open, setOpen] = useState(false);
  const [frozen, setFrozen] = useState<ViewerAlerts | null>(null);

  const live = useMemo(
    () => buildViewerAlerts({ faults, devices, roomStates, levels }),
    [faults, devices, roomStates, levels],
  );
  const shown = frozen ?? live;

  if (hasNothingToShow(shown)) {
    return null;
  }

  const alerting = shown.alertCount > 0;
  const count = alerting ? shown.alertCount : shown.warningCount;

  const pick = (globalId: string, deviceId: string) => {
    setOpen(false);
    setFrozen(null);
    onFocusRoom(globalId, deviceId);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setFrozen(next ? live : null);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "pointer-events-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm backdrop-blur transition-colors",
            alerting
              ? "border-status-error/40 bg-status-error/10 text-status-error hover:bg-status-error/20"
              : "border-status-warning/40 bg-status-warning/10 text-status-warning hover:bg-status-warning/20",
          )}
          aria-label={
            count > 0
              ? t("zonesByLevel.viewer.alerts.label", { count })
              : t("zonesByLevel.viewer.alerts.title")
          }
        >
          <TriangleAlert
            className={cn("h-3.5 w-3.5", alerting && "animate-pulse")}
            aria-hidden
          />
          <span className="tabular-nums">{count > 0 ? count : "—"}</span>
        </button>
      </PopoverTrigger>
      {/* Right-aligned: the chip sits in the viewer's top-right corner, and a
          centred popover would hang off the card. */}
      <PopoverContent align="end" className="max-h-72 w-72 overflow-y-auto p-0">
        {shown.alerts.length > 0 && (
          <AlertSection
            label={t("zonesByLevel.viewer.alerts.title")}
            groups={shown.alerts}
            onPick={pick}
          />
        )}
        {shown.warnings.length > 0 && (
          <AlertSection
            label={t("zonesByLevel.viewer.alerts.warnings")}
            groups={shown.warnings}
            onPick={pick}
          />
        )}
        {shown.offModelCount > 0 && (
          <Link
            to="/faults"
            className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <span className="truncate">
              {t("zonesByLevel.viewer.alerts.offModel", {
                count: shown.offModelCount,
              })}
            </span>
            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** One severity section: its rooms, each with the devices that raised it. */
const AlertSection: FC<{
  label: string;
  groups: AlertRoomGroup[];
  onPick: (globalId: string, deviceId: string) => void;
}> = ({ label, groups, onPick }) => {
  const { t } = useTranslation("home");
  return (
    <section className="border-b border-border/60 last:border-b-0">
      <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="pb-1">
        {groups.map((group) => (
          <li key={group.globalId}>
            <p className="flex items-baseline justify-between gap-2 px-3 pt-1 text-[11px] font-semibold text-foreground">
              <span className="truncate">{group.roomName}</span>
              <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                {group.levelName}
              </span>
            </p>
            <ul>
              {group.devices.map((row) => (
                <li key={row.deviceId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-accent/60"
                    onClick={() => onPick(group.globalId, row.deviceId)}
                  >
                    <TriangleAlert
                      className={cn(
                        "h-3 w-3 shrink-0",
                        SEVERITY_TEXT_CLASS[row.severity],
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[11px] text-foreground">
                        {row.deviceName}
                      </span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {row.label}
                      </span>
                    </span>
                    {row.faultCount > 1 && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {t("zonesByLevel.viewer.alerts.faults", {
                          count: row.faultCount,
                        })}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
};

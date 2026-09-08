import { useEffect, useRef, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowUpRight, Cpu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deviceMeasureReading, formatReading } from "@/lib/deviceSummary";
import { isThermostat } from "@/lib/devices";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import { DeviceSparkline } from "@/pages/devices/DeviceSparkline";
import { roomOccupancy, type RoomState } from "./roomStates";
import type { RevealedDevice } from "./useViewerState";

/** How long a device found by search stays ringed. */
const REVEAL_MS = 2000;

/** In-scene side panel with the selected room's live values. */
export const RoomPanel: FC<{
  state: RoomState;
  /** CSS color of the room's volume in the scene, tying the panel to it. */
  accent: string;
  /** Device the search landed on: scrolled to and ringed on arrival. */
  reveal?: RevealedDevice | null;
  onClose: () => void;
}> = ({ state, accent, reveal, onClose }) => {
  const { t, i18n } = useTranslation("home");
  const thermostat = state.devices.find(isThermostat);
  const occupancy = roomOccupancy(state);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const [ringed, setRinged] = useState<string | null>(null);

  // Keyed on the nonce, not the id: picking the same device twice must ring
  // it again. A device the room does not hold simply has no row to scroll to.
  const nonce = reveal?.nonce;
  const revealedId = reveal?.deviceId;
  useEffect(() => {
    if (!revealedId) {
      return undefined;
    }
    setRinged(revealedId);
    rows.current.get(revealedId)?.scrollIntoView({ block: "nearest" });
    const timer = window.setTimeout(() => setRinged(null), REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealedId, nonce]);

  return (
    <aside
      className="pointer-events-auto flex min-h-0 w-64 flex-col rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur"
      aria-label={state.name}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: accent }}
              aria-hidden
            />
            <span className="truncate">{state.name}</span>
          </h3>
          {occupancy !== null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {occupancy
                ? t("zonesByLevel.viewer.occupied")
                : t("zonesByLevel.viewer.vacant")}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label={t("zonesByLevel.viewer.closePanel")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 min-h-0 space-y-2 overflow-y-auto">
        {state.devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("zonesByLevel.viewer.noDevices")}
          </p>
        ) : (
          state.devices.map((device) => {
            const reading = deviceMeasureReading(device);
            const DeviceIcon = deviceTypeIcon(device.type) ?? Cpu;
            return (
              <div
                key={device.id}
                ref={(node) => {
                  if (node) {
                    rows.current.set(device.id, node);
                  } else {
                    rows.current.delete(device.id);
                  }
                }}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 transition-shadow",
                  ringed === device.id && "ring-2 ring-primary",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <DeviceIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground">
                    {device.name || device.id}
                  </span>
                </div>
                <span className="shrink-0 text-xs font-semibold text-foreground">
                  {reading ? formatReading(reading, i18n.language) : "—"}
                </span>
              </div>
            );
          })
        )}
        {thermostat && (
          <div className="rounded-lg bg-muted/40 px-2.5 py-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("zonesByLevel.viewer.trend")}
            </p>
            <DeviceSparkline
              deviceId={thermostat.id}
              metric="temperature"
              label={t("zonesByLevel.viewer.trend")}
            />
          </div>
        )}
      </div>

      {state.assetId && (
        <Link
          to={`/assets/${state.assetId}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t("zonesByLevel.viewer.openAsset")}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </aside>
  );
};

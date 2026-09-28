import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { Card } from "@/components/ui";
import { ConnectionStatusValue } from "@/components/ConnectionStatusBadge";
import { EmptyValue } from "@/components/EmptyValue";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { getConnectionStatus } from "@/lib/devices";
import { activeFaultSummary } from "@/lib/faults";
import { cn } from "@/lib/utils";
import { DeviceModeValue } from "./DeviceModeValue";
import { getFleetSummary } from "./standard-devices/registry";

/** Border tint per active severity — the card outline is the first thing
 *  scanned in a grid of dozens, so a faulty device reads before its label. */
const CARD_SEVERITY_CLASS = {
  alert: "border-status-error/50",
  warning: "border-status-warning/50",
  info: "border-status-info/50",
} as const;

/**
 * One device of the fleet grid: identity and location, the type's summary
 * from the standard-device registry, then operating mode and fault state.
 */
export function DeviceFleetCard({
  device,
  zonePath,
}: {
  device: Device;
  zonePath: string | null;
}) {
  const { t } = useTranslation(["devices", "common"]);

  const { open } = useResourceNavigation();
  const status = getConnectionStatus(device);
  const canSeeConnectionStatus = useCanSeeConnectionStatus();
  const faults = activeFaultSummary(device);
  const FleetSummary = getFleetSummary(device.type);

  return (
    <div className="group block h-full">
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

        <FleetSummary device={device} />

        <div className="mt-auto flex items-center gap-2 border-t pt-2.5 text-xs">
          <DeviceModeValue device={device} />
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

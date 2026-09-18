import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "react-error-boundary";
import { Card } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import type { Device } from "@gridone/sdk";
import { deviceAttributes, getConnectionStatus } from "@/lib/devices";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { DeviceFaultBadge } from "@/components/DeviceFaultBadge";
import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import {
  ConnectionStatusIcon,
  ConnectionStatusValue,
} from "@/components/ConnectionStatusBadge";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { getStandardDeviceEntry } from "./standard-devices/registry";

/** Default card content for devices without a registered standard type. */
function DefaultCardContent({ device }: { device: Device }) {
  const { t } = useTranslation(["devices", "common"]);
  const configEntries = Object.entries(device.config);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="text-[10px]">
        {Object.keys(deviceAttributes(device)).length}{" "}
        {t("common:common.attributes")}
      </Badge>
      {configEntries.length > 0 && (
        <span className="text-[10px] text-muted-foreground truncate">
          {configEntries.map(([key, value], i) => (
            <span key={key}>
              {i > 0 && " · "}
              <span className="font-medium">{key}</span>: {String(value)}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function DeviceCard({ device }: { device: Device }) {
  const { open } = useResourceNavigation();
  const standardEntry = getStandardDeviceEntry(device.type);
  const Content = standardEntry?.Preview ?? DefaultCardContent;
  const connectionStatus = getConnectionStatus(device);
  const canSeeConnectionStatus = useCanSeeConnectionStatus();

  return (
    <div className="group block h-full">
      <Card
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("a,button,input"))
            open(`/devices/${device.id}`);
        }}
        className="card-glow flex h-full flex-col justify-between gap-2 p-4 transition-all duration-200 hover:-translate-y-0.5"
      >
        {/* ── Header (generic) ── */}
        <div>
          <div className="flex items-center gap-1.5">
            {canSeeConnectionStatus && (
              <span className="inline-flex items-center gap-1 text-xs">
                <ConnectionStatusIcon status={connectionStatus} />
                <ConnectionStatusValue status={connectionStatus} />
              </span>
            )}
            <DeviceFaultBadge device={device} />
            <span className="ml-auto">
              <DeviceTypeChip type={device.type} />
            </span>
          </div>
          <h2 className="mt-0.5 min-w-0 truncate font-display text-base font-semibold text-card-foreground">
            <Link to={`/devices/${device.id}`}>
              {device.name || device.id}
              <span aria-hidden> →</span>
            </Link>
          </h2>
        </div>

        {/* ── Content (type-specific or fallback) ── */}
        <ErrorBoundary fallback={<DefaultCardContent device={device} />}>
          <Content device={device} />
        </ErrorBoundary>
      </Card>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "react-error-boundary";
import { Card } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Device } from "@/api/devices";
import { Link } from "react-router";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { getStandardDeviceEntry } from "./standard-devices/registry";

/** Default card content for devices without a registered standard type. */
function DefaultCardContent({ device }: { device: Device }) {
  const { t } = useTranslation();
  const configEntries = Object.entries(device.config ?? {});

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="text-[10px]">
        {Object.keys(device.attributes).length} {t("common.attributes")}
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
  const standardEntry = getStandardDeviceEntry(device.type);
  const Content = standardEntry?.Preview ?? DefaultCardContent;

  return (
    <Link to={`/devices/${device.id}`} className="group block h-full">
      <Card className="flex h-full flex-col justify-between gap-2 p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
        {/* ── Header (generic) ── */}
        <div>
          <div className="flex items-center justify-between gap-1.5">
            <p className="truncate text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {device.driverId}
            </p>
            <DeviceTypeChip type={device.type} />
          </div>
          <h2 className="mt-0.5 truncate text-base font-semibold text-card-foreground">
            {device.name || device.id}
          </h2>
        </div>

        {/* ── Content (type-specific or fallback) ── */}
        <ErrorBoundary fallback={<DefaultCardContent device={device} />}>
          <Content device={device} />
        </ErrorBoundary>
      </Card>
    </Link>
  );
}

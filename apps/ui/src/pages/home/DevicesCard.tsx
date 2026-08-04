import { ComponentType, FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AirVent,
  CloudSun,
  Cpu,
  Fan,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import type { Device } from "@gridone/sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { DeviceType } from "@/lib/devices";
import { CardHeaderLink } from "./CardHeaderLink";

type IconType = ComponentType<{ className?: string }>;

const DEVICE_TYPE_ICONS: Record<DeviceType, IconType> = {
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Awhp]: Fan,
  [DeviceType.ElectricityMeter]: Zap,
  [DeviceType.WeatherSensor]: CloudSun,
  [DeviceType.AhuDoubleFlux]: AirVent,
  [DeviceType.AhuSingleFlux]: AirVent,
  [DeviceType.AirExtractor]: Wind,
};

const KNOWN_DEVICE_TYPES = new Set<string>(Object.values(DeviceType));
const OTHER_KEY = "other";

type DeviceTile = {
  key: string;
  label: string;
  count: number;
  icon: IconType;
  to: string;
};

/** Fleet overview: one tile per standard device type present, linking to the
 *  filtered device list; the header totals the fleet. */
export const DevicesCard: FC<{ devices: Device[]; loading: boolean }> = ({
  devices,
  loading,
}) => {
  const { t } = useTranslation(["home", "standardDevices"]);
  const can = usePermissions();

  const tiles = buildDeviceTiles(devices, t);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t("devicesCard.title")}</CardTitle>
        {devices.length > 0 && (
          <CardHeaderLink to="/devices">
            {`${devices.length} ${t("devicesCard.unit", {
              count: devices.length,
            })}`}
          </CardHeaderLink>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <TilesSkeleton />
        ) : tiles.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {tiles.map((tile) => (
              <DeviceTypeTile key={tile.key} tile={tile} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("devicesCard.empty")}{" "}
            {can("devices:write") && (
              <Link
                to="/devices/new"
                className="font-medium text-primary hover:underline"
              >
                {t("devicesCard.add")}
              </Link>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

/** Group devices by known type (untyped/unknown fall under `other`), ordered
 *  by count desc with `other` last. Each known type links to its filtered
 *  list; `other` links to the unfiltered list. */
function buildDeviceTiles(
  devices: Device[],
  t: TFunction<["home", "standardDevices"]>,
): DeviceTile[] {
  const counts = new Map<string, number>();
  for (const device of devices) {
    const key =
      device.type && KNOWN_DEVICE_TYPES.has(device.type)
        ? device.type
        : OTHER_KEY;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a, ca], [b, cb]) =>
      a === OTHER_KEY ? 1 : b === OTHER_KEY ? -1 : cb - ca,
    )
    .map(([key, count]) => ({
      key,
      label: deviceTypeLabel(key, count, t),
      count,
      icon: key === OTHER_KEY ? Cpu : DEVICE_TYPE_ICONS[key as DeviceType],
      to: key === OTHER_KEY ? "/devices" : `/devices?type=${key}`,
    }));
}

function deviceTypeLabel(
  key: string,
  count: number,
  t: TFunction<["home", "standardDevices"]>,
): string {
  const form = count === 1 ? "name" : "name_plural";
  if (key === OTHER_KEY) {
    return t(`other.${form}`, { ns: "standardDevices" });
  }
  return t(`${key as DeviceType}.${form}`, { ns: "standardDevices" });
}

const DeviceTypeTile: FC<{ tile: DeviceTile }> = ({ tile }) => {
  const Icon = tile.icon;
  return (
    <Link
      to={tile.to}
      className="group rounded-lg border border-border p-4 transition-colors hover:border-primary/50"
    >
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-foreground">
        {tile.count}
      </p>
      <p className="truncate text-sm text-muted-foreground transition-colors group-hover:text-foreground">
        {tile.label}
      </p>
    </Link>
  );
};

const TilesSkeleton: FC = () => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-[104px] rounded-lg" />
    ))}
  </div>
);

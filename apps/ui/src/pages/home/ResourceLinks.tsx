import { FC, ComponentType } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CloudSun, Cpu, Fan, Thermometer, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH3 } from "@/components/ui/typography";
import { Device, DeviceType, listDevices } from "@/api/devices";
import { Asset, listAssets } from "@/api/assets";
import { usePermissions } from "@/contexts/AuthContext";

type IconType = ComponentType<{ className?: string }>;

const DEVICE_TYPE_ICONS: Record<DeviceType, IconType> = {
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Awhp]: Fan,
  [DeviceType.ElectricityMeter]: Zap,
  [DeviceType.WeatherSensor]: CloudSun,
};

const KNOWN_DEVICE_TYPES = new Set<string>(Object.values(DeviceType));
const OTHER_KEY = "other";

type ResourceItem = {
  key: string;
  label: string;
  count?: number;
  to: string;
  icon?: IconType;
};

type EmptyState = {
  text: string;
  linkText: string;
  to: string;
  canAdd: boolean;
};

/** Flat, hero-styled resource panels. Each panel lists only the types actually
 *  present (deduped from the live lists), each one a link; an empty panel shows
 *  a "nothing yet — add one" prompt. Kept narrow on lg+ so the building
 *  silhouette stays visible alongside. */
export const ResourceLinks: FC = () => {
  const { t } = useTranslation(["home", "standardDevices"]);
  const can = usePermissions();

  const { data: devices, isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["devices", undefined],
    queryFn: () => listDevices(),
  });
  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["home", "assets-flat"],
    queryFn: () => listAssets(),
  });

  const deviceItems = buildDeviceItems(devices ?? [], t);

  // The asset tree always has an `org` root; treat that as scaffolding rather
  // than a user-facing zone. The assets list is a tree (no type filter), so we
  // just surface the total and link to it.
  const zoneCount = (assets ?? []).filter((a) => a.type !== "org").length;
  const zoneItems: ResourceItem[] =
    zoneCount > 0
      ? [
          {
            key: "zones",
            label: `${zoneCount} ${t("resources.zones.unit", { count: zoneCount })}`,
            to: "/assets",
          },
        ]
      : [];

  return (
    <div className="space-y-10 lg:max-w-4xl">
      <ResourcePanel
        title={t("resources.devices.title")}
        to="/devices"
        loading={devicesLoading}
        items={deviceItems}
        empty={{
          text: t("resources.devices.empty"),
          linkText: t("resources.devices.add"),
          to: "/devices/new",
          canAdd: can("devices:write"),
        }}
      />
      <ResourcePanel
        title={t("resources.zones.title")}
        to="/assets"
        loading={assetsLoading}
        items={zoneItems}
        empty={{
          text: t("resources.zones.empty"),
          linkText: t("resources.zones.add"),
          to: "/assets/new",
          canAdd: can("assets:write"),
        }}
      />
    </div>
  );
};

/** Group devices by known type (untyped/unknown fall under `other`), ordered by
 *  count desc with `other` last. Each known type links to its filtered list;
 *  `other` links to the unfiltered list. */
function buildDeviceItems(
  devices: Device[],
  t: TFunction<["home", "standardDevices"]>,
): ResourceItem[] {
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

const ResourcePanel: FC<{
  title: string;
  to: string;
  loading: boolean;
  items: ResourceItem[];
  empty: EmptyState;
}> = ({ title, to, loading, items, empty }) => (
  <section className="space-y-3">
    <Link
      to={to}
      className="group inline-flex items-center gap-2 text-foreground"
    >
      <TypographyH3>{title}</TypographyH3>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>

    {loading ? (
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-lg" />
        ))}
      </div>
    ) : items.length > 0 ? (
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => (
          <ResourceTypeLink key={item.key} item={item} />
        ))}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">
        {empty.text}{" "}
        {empty.canAdd && (
          <Link
            to={empty.to}
            className="font-medium text-primary hover:underline"
          >
            {empty.linkText}
          </Link>
        )}
      </p>
    )}
  </section>
);

const ResourceTypeLink: FC<{ item: ResourceItem }> = ({ item }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span className="font-medium text-foreground group-hover:text-primary">
        {item.label}
      </span>
      {item.count != null && (
        <span className="font-mono text-xs tabular-nums">{item.count}</span>
      )}
    </Link>
  );
};

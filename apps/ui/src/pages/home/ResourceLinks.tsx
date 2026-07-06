import { FC, ComponentType, ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import {
  AirVent,
  ArrowRight,
  Bell,
  Check,
  CloudSun,
  Cpu,
  Fan,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH3 } from "@/components/ui/typography";
import { Device, DeviceType, listDevices } from "@/api/devices";
import { Asset, listAssets } from "@/api/assets";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermissions } from "@/contexts/AuthContext";
import { SEVERITY_HOVER_TEXT_CLASS, SEVERITY_TEXT_CLASS } from "@/lib/severity";
import { cn } from "@/lib/utils";

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

/** Cap the home-page notifications list; the rest is reachable via the
 *  "and N more" link to the full notifications page. */
const MAX_HOME_NOTIFICATIONS = 5;

type ResourceItem = {
  key: string;
  label: string;
  count?: number;
  to: string;
  icon?: IconType;
  /** Static icon tint (e.g. severity); defaults to inheriting the link color. */
  iconClassName?: string;
  /** Group-hover label color; defaults to primary. */
  hoverClassName?: string;
};

/** Flat, hero-styled resource panels: notifications, devices and zones. Each
 *  lists only what's present, every entry a link; an empty panel shows a hint.
 *  Kept narrow on lg+ so the building silhouette stays visible alongside. */
export const ResourceLinks: FC = () => {
  const { t } = useTranslation(["home", "standardDevices"]);
  const can = usePermissions();

  const { page: notifications, loading: notificationsLoading } =
    useNotifications({ dismissed: false });
  const { data: devices, isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["devices", undefined],
    queryFn: () => listDevices(),
  });
  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["home", "assets-flat"],
    queryFn: () => listAssets(),
  });

  const notificationItems: ResourceItem[] = (notifications?.items ?? [])
    .slice(0, MAX_HOME_NOTIFICATIONS)
    .map(({ notification }) => ({
      key: notification.id,
      label: notification.title,
      to: "/notifications",
      icon: Bell,
      iconClassName: SEVERITY_TEXT_CLASS[notification.severity],
      hoverClassName: SEVERITY_HOVER_TEXT_CLASS[notification.severity],
    }));

  const moreNotificationsCount =
    (notifications?.total ?? 0) - notificationItems.length;

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
        title={t("resources.notifications.title")}
        to="/notifications"
      >
        {notificationsLoading ? (
          <ContentSkeleton />
        ) : (
          <div className="space-y-2">
            <ResourcePanelContent
              items={notificationItems}
              column
              empty={
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-emerald-500" />
                  {t("resources.notifications.empty")}
                </p>
              }
            />
            {moreNotificationsCount > 0 && (
              <Link
                to="/notifications"
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                {t("resources.notifications.more", {
                  count: moreNotificationsCount,
                })}
              </Link>
            )}
          </div>
        )}
      </ResourcePanel>

      <ResourcePanel title={t("resources.devices.title")} to="/devices">
        {devicesLoading ? (
          <ContentSkeleton />
        ) : (
          <ResourcePanelContent
            items={deviceItems}
            empty={
              <ResourceEmpty
                text={t("resources.devices.empty")}
                linkText={t("resources.devices.add")}
                to="/devices/new"
                canAdd={can("devices:write")}
              />
            }
          />
        )}
      </ResourcePanel>

      <ResourcePanel title={t("resources.zones.title")} to="/assets">
        {assetsLoading ? (
          <ContentSkeleton />
        ) : (
          <ResourcePanelContent
            items={zoneItems}
            empty={
              <ResourceEmpty
                text={t("resources.zones.empty")}
                linkText={t("resources.zones.add")}
                to="/assets/new"
                canAdd={can("assets:write")}
              />
            }
          />
        )}
      </ResourcePanel>
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

/** Panel shell: a heading that links to the resource list, plus arbitrary
 *  content (the loaded list, an empty hint, or a skeleton). */
const ResourcePanel: FC<{ title: string; to: string; children: ReactNode }> = ({
  title,
  to,
  children,
}) => (
  <section className="space-y-3">
    <Link
      to={to}
      className="group inline-flex items-center gap-2 text-foreground"
    >
      <TypographyH3>{title}</TypographyH3>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
    {children}
  </section>
);

/** Renders the resource items, or the provided empty node when there are none.
 *  `column` stacks items vertically (one per line) instead of wrapping rows. */
const ResourcePanelContent: FC<{
  items: ResourceItem[];
  empty: ReactNode;
  column?: boolean;
}> = ({ items, empty, column = false }) =>
  items.length > 0 ? (
    <div
      className={cn(
        column ? "flex flex-col gap-2" : "flex flex-wrap gap-x-5 gap-y-2",
      )}
    >
      {items.map((item) => (
        <ResourceTypeLink key={item.key} item={item} />
      ))}
    </div>
  ) : (
    empty
  );

const ContentSkeleton: FC = () => (
  <div className="flex flex-wrap gap-2">
    {[0, 1, 2].map((i) => (
      <Skeleton key={i} className="h-8 w-28 rounded-lg" />
    ))}
  </div>
);

const ResourceEmpty: FC<{
  text: string;
  linkText: string;
  to: string;
  canAdd: boolean;
}> = ({ text, linkText, to, canAdd }) => (
  <p className="text-sm text-muted-foreground">
    {text}{" "}
    {canAdd && (
      <Link to={to} className="font-medium text-primary hover:underline">
        {linkText}
      </Link>
    )}
  </p>
);

const ResourceTypeLink: FC<{ item: ResourceItem }> = ({ item }) => {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:underline"
    >
      {Icon && <Icon className={cn("h-4 w-4", item.iconClassName)} />}
      <span
        className={cn(
          "font-medium text-foreground",
          item.hoverClassName ?? "group-hover:text-primary",
        )}
      >
        {item.label}
      </span>
      {item.count != null && (
        <span className="font-mono text-xs tabular-nums group-hover:text-primary">
          {item.count}
        </span>
      )}
    </Link>
  );
};

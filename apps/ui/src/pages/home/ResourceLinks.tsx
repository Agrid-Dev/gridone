import { FC, ComponentType } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  CloudSun,
  Cpu,
  Fan,
  Thermometer,
  Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyEyebrow, TypographyH3 } from "@/components/ui/typography";
import { Device, DeviceType, listDevices } from "@/api/devices";
import { Asset, listAssets } from "@/api/assets";

type IconType = ComponentType<{ className?: string }>;

const DEVICE_TYPE_ORDER: DeviceType[] = [
  DeviceType.Thermostat,
  DeviceType.Awhp,
  DeviceType.ElectricityMeter,
  DeviceType.WeatherSensor,
];

const DEVICE_TYPE_ICONS: Record<DeviceType, IconType> = {
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Awhp]: Fan,
  [DeviceType.ElectricityMeter]: Zap,
  [DeviceType.WeatherSensor]: CloudSun,
};

/** Resource cards (Assets, Devices) with live counts plus the per-type device
 *  breakdown. Owns its own data fetching. */
export const ResourceLinks: FC = () => {
  const { t, i18n } = useTranslation("home");
  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const formatNumber = (n: number) => numberFormatter.format(n);

  const { data: devices, isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["devices", undefined],
    queryFn: () => listDevices(),
  });
  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["home", "assets-flat"],
    queryFn: () => listAssets(),
  });

  const devicesCountByType = countDevicesByType(devices ?? []);

  return (
    <div>
      <div>
        <TypographyH3>{t("resources.title")}</TypographyH3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("resources.description")}
        </p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ResourceLink
          to="/assets"
          icon={Building2}
          title={t("app.assets", { ns: "common" })}
          description={t("resources.zones.description")}
          count={assets?.length ?? 0}
          countLabel={t("resources.zones.unit", { count: assets?.length ?? 0 })}
          loading={assetsLoading}
          formatNumber={formatNumber}
        />
        <ResourceLink
          to="/devices"
          icon={Cpu}
          title={t("app.devices", { ns: "common" })}
          description={t("resources.devices.description")}
          count={devices?.length ?? 0}
          countLabel={t("resources.devices.unit", {
            count: devices?.length ?? 0,
          })}
          loading={devicesLoading}
          formatNumber={formatNumber}
        />
      </div>

      <div className="mt-6">
        <TypographyEyebrow>{t("resources.byType")}</TypographyEyebrow>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEVICE_TYPE_ORDER.map((type) => (
            <DeviceTypeCard
              key={type}
              type={type}
              count={devicesCountByType[type] ?? 0}
              loading={devicesLoading}
              formatNumber={formatNumber}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

function countDevicesByType(
  devices: Device[],
): Partial<Record<DeviceType, number>> {
  const counts: Partial<Record<DeviceType, number>> = {};
  for (const d of devices) {
    if (!d.type) continue;
    counts[d.type] = (counts[d.type] ?? 0) + 1;
  }
  return counts;
}

const ResourceLink: FC<{
  to: string;
  icon: IconType;
  title: string;
  description: string;
  count: number;
  countLabel: string;
  loading: boolean;
  formatNumber: (n: number) => string;
}> = ({
  to,
  icon: Icon,
  title,
  description,
  count,
  countLabel,
  loading,
  formatNumber,
}) => (
  <Link
    to={to}
    className="group block rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
  >
    <div className="flex items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <TypographyH3>{title}</TypographyH3>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex items-baseline gap-1.5">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {formatNumber(count)}
            </span>
          )}
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {countLabel}
          </span>
        </div>
      </div>
    </div>
  </Link>
);

const DeviceTypeCard: FC<{
  type: DeviceType;
  count: number;
  loading: boolean;
  formatNumber: (n: number) => string;
}> = ({ type, count, loading, formatNumber }) => {
  const { t } = useTranslation(["home", "common"]);
  const Icon = DEVICE_TYPE_ICONS[type];
  return (
    <Link
      to={`/devices?type=${type}`}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-foreground group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold text-foreground">
          {t(`common.deviceTypes.${type}`, { ns: "common" })}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-3 w-20" />
        ) : (
          <p className="text-xs text-muted-foreground">
            {formatNumber(count)} {t("resources.devicesUnit", { count })}
          </p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
};

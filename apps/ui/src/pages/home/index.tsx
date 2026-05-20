import { FC, ComponentType } from "react";
import { Link, Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  CloudSun,
  Cpu,
  Fan,
  LayoutGrid,
  MapPin,
  Maximize2,
  Briefcase,
  Layers,
  Thermometer,
  ArrowRight,
  Zap,
} from "lucide-react";
import { isFeatureEnabled } from "@/utils/featureFlags";
import { Card } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypographyEyebrow,
  TypographyH1,
  TypographyH3,
  TypographySmall,
} from "@/components/ui/typography";
import { Device, DeviceType, listDevices } from "@/api/devices";
import { Asset, listAssets } from "@/api/assets";
import { buildingPlaceholderData } from "./placeholderData";
import { Badge } from "@/components/ui/badge";

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

const Home: FC = () => {
  const { t, i18n } = useTranslation("home");
  const homeEnabled = isFeatureEnabled("buildingHomepage");
  if (!homeEnabled) {
    return <Navigate to="/devices" replace />;
  }

  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const formatNumber = (n: number) => numberFormatter.format(n);

  const b = buildingPlaceholderData;
  const coords = `${b.latitude.toFixed(4)}°, ${b.longitude.toFixed(4)}°`;

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
    <section className="space-y-10">
      <HeroSection formatNumber={formatNumber} />

      <div>
        <SectionHeader
          title={t("resources.title")}
          description={t("resources.description")}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ResourceLink
            to="/assets"
            icon={Building2}
            title={t("app.assets", { ns: "common" })}
            description={t("resources.zones.description")}
            count={assets?.length ?? 0}
            countLabel={t("resources.zones.unit")}
            loading={assetsLoading}
            formatNumber={formatNumber}
          />
          <ResourceLink
            to="/devices"
            icon={Cpu}
            title={t("app.devices", { ns: "common" })}
            description={t("resources.devices.description")}
            count={devices?.length ?? 0}
            countLabel={t("resources.devices.unit")}
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

      <MetadataSection
        items={[
          {
            icon: Briefcase,
            label: t("details.operator"),
            value: b.operator,
          },
          { icon: MapPin, label: t("details.address"), value: b.address },
          {
            icon: Maximize2,
            label: t("details.surface"),
            value: t("units.surfaceSquareMeters", {
              value: formatNumber(b.surface),
            }),
          },
          {
            icon: Layers,
            label: t("details.floors"),
            value: formatNumber(b.floors),
          },
          {
            icon: CalendarDays,
            label: t("details.yearBuilt"),
            value: String(b.yearBuilt),
          },
          {
            icon: LayoutGrid,
            label: t("details.coordinates"),
            value: coords,
          },
        ]}
      />
    </section>
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

const HeroSection: FC<{ formatNumber: (n: number) => string }> = ({
  formatNumber,
}) => {
  const { t } = useTranslation("home");
  const b = buildingPlaceholderData;
  return (
    <Card className="overflow-hidden border-border/60 shadow-lg">
      <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
        <div className="relative aspect-[4/3] w-full overflow-hidden md:aspect-auto md:min-h-[320px]">
          <img
            src={b.coverUrl}
            alt={b.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent md:bg-gradient-to-r" />
          <Badge className="absolute m-2" variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
            {t("status.online")}
          </Badge>
        </div>
        <div className="flex flex-col justify-center gap-4 p-8 md:p-10">
          <div>
            <TypographyEyebrow>{b.type}</TypographyEyebrow>
            <div className="mt-2">
              <TypographyH1>{b.name}</TypographyH1>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{b.address}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
            <HeroStat
              label={t("hero.surface")}
              value={t("units.surfaceSquareMeters", {
                value: formatNumber(b.surface),
              })}
            />
            <HeroStat label={t("hero.floors")} value={formatNumber(b.floors)} />
            <HeroStat label={t("hero.built")} value={String(b.yearBuilt)} />
          </div>
        </div>
      </div>
    </Card>
  );
};

const HeroStat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <TypographySmall className="block uppercase tracking-[0.18em]">
      {label}
    </TypographySmall>
    <p className="mt-1 font-display text-xl font-semibold text-foreground">
      {value}
    </p>
  </div>
);

const SectionHeader: FC<{
  title: string;
  description?: string;
}> = ({ title, description }) => (
  <div>
    <TypographyH3>{title}</TypographyH3>
    {description && (
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    )}
  </div>
);

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
            {formatNumber(count)} {t("resources.devicesUnit")}
          </p>
        )}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
};

const MetadataSection: FC<{
  items: { icon: IconType; label: string; value: string }[];
}> = ({ items }) => {
  const { t } = useTranslation("home");
  return (
    <div>
      <SectionHeader
        title={t("details.title")}
        description={t("details.description")}
      />
      <Card className="mt-6">
        <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 truncate font-display text-base font-semibold text-foreground">
                  {value}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
};

export default Home;

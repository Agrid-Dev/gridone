import { FC, ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Briefcase,
  CalendarDays,
  Layers,
  LayoutGrid,
  MapPin,
  Maximize2,
} from "lucide-react";
import { Card } from "@/components/ui";
import { TypographyH3 } from "@/components/ui/typography";
import { BuildingProfile } from "@/api/assets";
import {
  useBuildingProfile,
  isProfileConfigured,
} from "@/hooks/useBuildingProfile";
import { BuildingSilhouette } from "@/components/BuildingSilhouette";
import { ProfileHero } from "./ProfileHero";
import { ResourceLinks } from "./ResourceLinks";

type IconType = ComponentType<{ className?: string }>;

const Home: FC = () => {
  const { t, i18n } = useTranslation("home");
  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const formatNumber = (n: number) => numberFormatter.format(n);

  const { data: profile, isLoading: profileLoading } = useBuildingProfile();

  return (
    <section className="relative isolate space-y-10">
      <BuildingSilhouette className="fixed inset-0 -z-10" />
      <ProfileHero profile={profile} loading={profileLoading} />
      <ResourceLinks />
      {isProfileConfigured(profile) && (
        <MetadataSection items={buildMetadata(profile!, t, formatNumber)} />
      )}
    </section>
  );
};

type MetadataItem = { icon: IconType; label: string; value: string };

/** Build the metadata rows for the set fields of the profile, skipping any
 *  field the operator left blank. */
function buildMetadata(
  profile: BuildingProfile,
  t: TFunction<"home">,
  formatNumber: (n: number) => string,
): MetadataItem[] {
  const items: MetadataItem[] = [];
  if (profile.operator) {
    items.push({
      icon: Briefcase,
      label: t("details.operator"),
      value: profile.operator,
    });
  }
  if (profile.address) {
    items.push({
      icon: MapPin,
      label: t("details.address"),
      value: profile.address,
    });
  }
  if (profile.surface != null) {
    items.push({
      icon: Maximize2,
      label: t("details.surface"),
      value: t("units.surfaceSquareMeters", {
        value: formatNumber(profile.surface),
      }),
    });
  }
  if (profile.floors != null) {
    items.push({
      icon: Layers,
      label: t("details.floors"),
      value: formatNumber(profile.floors),
    });
  }
  if (profile.yearBuilt != null) {
    items.push({
      icon: CalendarDays,
      label: t("details.yearBuilt"),
      value: String(profile.yearBuilt),
    });
  }
  if (profile.latitude != null && profile.longitude != null) {
    items.push({
      icon: LayoutGrid,
      label: t("details.coordinates"),
      value: `${profile.latitude.toFixed(4)}°, ${profile.longitude.toFixed(4)}°`,
    });
  }
  return items;
}

const MetadataSection: FC<{
  items: MetadataItem[];
}> = ({ items }) => {
  const { t } = useTranslation("home");
  if (items.length === 0) return null;
  return (
    <div>
      <div>
        <TypographyH3>{t("details.title")}</TypographyH3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("details.description")}
        </p>
      </div>
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

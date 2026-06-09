import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Building2, MapPin } from "lucide-react";
import { Card } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypographyH1,
  TypographyH3,
  TypographySmall,
} from "@/components/ui/typography";
import { BuildingProfile } from "@/api/assets";
import { OrgAvatar } from "@/components/OrgAvatar";
import { isProfileConfigured } from "@/hooks/useBuildingProfile";

/** Profile identity block: skeleton while loading, a "set up" prompt when the
 *  profile is unconfigured, otherwise the building hero. */
export const ProfileHero: FC<{
  profile: BuildingProfile | undefined;
  loading: boolean;
}> = ({ profile, loading }) => {
  if (loading) {
    return <Skeleton className="h-[320px] w-full rounded-xl" />;
  }
  if (!isProfileConfigured(profile)) {
    return <SetupEmptyState />;
  }
  return <Hero profile={profile!} />;
};

const SetupEmptyState: FC = () => {
  const { t } = useTranslation("home");
  return (
    <Card className="flex flex-col items-center gap-4 border-dashed px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Building2 className="h-7 w-7" />
      </div>
      <div className="max-w-md space-y-1.5">
        <TypographyH3>{t("setup.title")}</TypographyH3>
        <p className="text-sm text-muted-foreground">
          {t("setup.description")}
        </p>
      </div>
    </Card>
  );
};

const Hero: FC<{ profile: BuildingProfile }> = ({ profile }) => {
  const { t, i18n } = useTranslation("home");
  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const formatNumber = (n: number) => numberFormatter.format(n);

  const stats: { label: string; value: string }[] = [];
  if (profile.surface != null) {
    stats.push({
      label: t("hero.surface"),
      value: t("units.surfaceSquareMeters", {
        value: formatNumber(profile.surface),
      }),
    });
  }
  if (profile.floors != null) {
    stats.push({
      label: t("hero.floors"),
      value: formatNumber(profile.floors),
    });
  }
  if (profile.yearBuilt != null) {
    stats.push({ label: t("hero.built"), value: String(profile.yearBuilt) });
  }

  return (
    <div className="grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
      <Card className="overflow-hidden border-border/60 shadow-lg">
        <div className="relative aspect-[4/3] w-full">
          {profile.coverUrl ? (
            <>
              <img
                src={profile.coverUrl}
                alt={profile.name ?? ""}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-accent">
              <OrgAvatar icon={profile.icon} name={profile.name} size="lg" />
            </div>
          )}
        </div>
      </Card>
      <div className="flex flex-col justify-center gap-4 md:py-6">
        <TypographyH1>{profile.name}</TypographyH1>
        {profile.address && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{profile.address}</span>
          </div>
        )}
        {stats.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
            {stats.map((stat) => (
              <HeroStat
                key={stat.label}
                label={stat.label}
                value={stat.value}
              />
            ))}
          </div>
        )}
      </div>
    </div>
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

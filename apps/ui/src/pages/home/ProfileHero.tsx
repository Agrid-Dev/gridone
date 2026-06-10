import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypographyH1,
  TypographyH5,
  TypographySmall,
} from "@/components/ui/typography";
import { BuildingProfile } from "@/api/assets";
import { OrgAvatar } from "@/components/OrgAvatar";
import { isProfileConfigured } from "@/hooks/useBuildingProfile";
import { cn } from "@/lib/utils";

/** Profile identity block: skeleton while loading, a "set up" prompt when the
 *  profile is unconfigured, otherwise the building hero. */
export const ProfileHero: FC<{
  profile: BuildingProfile | undefined;
  loading: boolean;
}> = ({ profile, loading }) => {
  if (loading) {
    return <Skeleton className="h-[320px] w-full rounded-xl" />;
  }

  return <Hero profile={profile!} />;
};

const SetupEmptyState: FC = () => {
  const { t } = useTranslation("home");
  return (
    <div className="mx-auto max-w-sm rounded-lg border border-dashed border-border px-6 py-4 text-center text-muted-foreground">
      <div className="flex items-center justify-center gap-2">
        <Pencil className="h-4 w-4 shrink-0" />
        <TypographyH5>{t("setup.title")}</TypographyH5>
      </div>
      <p className="mt-1 text-sm">{t("setup.description")}</p>
    </div>
  );
};

const Hero: FC<{ profile: BuildingProfile }> = ({ profile }) => {
  const { t } = useTranslation("home");

  const stats = ["surface", "floors", "built"].map((key) => ({
    label: t(`hero.${key}`, { defaultValue: key }),
    value: profile[key as keyof BuildingProfile],
  }));

  return (
    <div className="grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
      {profile.coverUrl ? (
        <div className="relative aspect-[4/3] w-full">
          <img
            src={profile.coverUrl}
            alt={profile.name ?? ""}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
        </div>
      ) : null}
      <div className="flex flex-col justify-center items-center gap-6 md:py-6">
        <OrgAvatar size="lg" {...profile} />
        <TypographyH1>{profile.name || t("hero.defaultName")}</TypographyH1>
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          {profile.address ? (
            <span>{profile.address}</span>
          ) : (
            <span className="italic">{t("hero.addressEmpty")}</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3 justify-center">
          {stats.map((stat) => (
            <HeroStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>

        {!isProfileConfigured(profile) && <SetupEmptyState />}
      </div>
    </div>
  );
};

const HeroStat: FC<{ label: string; value: string | number | null }> = ({
  label,
  value,
}) => {
  const { i18n } = useTranslation();
  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const formatNumber = (n: number) => numberFormatter.format(n);
  const formatStatValue = (rawValue: string | number | null): string => {
    switch (typeof rawValue) {
      case "string":
        return rawValue;

      case "number":
        return formatNumber(rawValue);
      default:
        return "-";
    }
  };
  return (
    <div>
      <TypographySmall className="block uppercase tracking-[0.18em]">
        {label}
      </TypographySmall>
      <p
        className={cn(
          "mt-1 font-display text-xl font-semibold",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {formatStatValue(value)}
      </p>
    </div>
  );
};

import { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Pencil, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypographyH1,
  TypographyH5,
  TypographySmall,
} from "@/components/ui/typography";
import type { BuildingProfile } from "@gridone/sdk";
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
    <Link
      to="/profile/edit"
      className="mx-auto block max-w-sm rounded-lg border border-dashed border-border px-6 py-4 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <div className="flex items-center justify-center gap-2">
        <Pencil className="h-4 w-4 shrink-0" />
        <TypographyH5>{t("setup.title")}</TypographyH5>
      </div>
      <p className="mt-1 text-sm">{t("setup.description")}</p>
    </Link>
  );
};

const Hero: FC<{ profile: BuildingProfile }> = ({ profile }) => {
  const { t } = useTranslation("home");

  // i18n keys stay camelCase; the wire fields they read are snake_case.
  const stats = (
    [
      ["surface", profile.surface],
      ["floors", profile.floors],
      ["yearBuilt", profile.year_built],
    ] as const
  ).map(([key, value]) => ({
    label: t(`hero.${key}`, { defaultValue: key }),
    value: value ?? null,
  }));

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col items-center justify-center gap-6 md:py-6">
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

        <div className="mt-2 flex flex-wrap justify-center gap-x-8 gap-y-3">
          {stats.map((stat) => (
            <HeroStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>

        {isProfileConfigured(profile) ? (
          <Link
            to="/profile/edit"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("editProfile")}
          </Link>
        ) : (
          <SetupEmptyState />
        )}
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

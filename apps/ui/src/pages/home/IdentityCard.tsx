import { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { MapPin, Pencil } from "lucide-react";
import type { BuildingProfile } from "@gridone/sdk";
import { Card, CardContent } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH5, TypographySmall } from "@/components/ui/typography";
import { OrgAvatar } from "@/components/OrgAvatar";
import { EmptyValue } from "@/components/EmptyValue";
import { useDeviceContext } from "@/contexts/DeviceContext";
import { isProfileConfigured } from "@/hooks/useBuildingProfile";
import { cn } from "@/lib/utils";

/** Building identity: avatar, name, address, live-connection badge and the
 *  key-figures grid. Unconfigured profiles get the setup prompt in place of
 *  the identity block; the other cards of the page render regardless. */
export const IdentityCard: FC<{
  profile: BuildingProfile | undefined;
  zoneCount: number;
  orgName: string | null;
  loading: boolean;
}> = ({ profile, zoneCount, orgName, loading }) => {
  if (loading) {
    return <Skeleton className="h-[360px] w-full rounded-lg" />;
  }

  const configured = isProfileConfigured(profile);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="space-y-4 p-6">
          <OrgAvatar size="lg" icon={profile?.icon} name={profile?.name} />
          {configured ? (
            <Identity profile={profile!} orgName={orgName} />
          ) : (
            <SetupPrompt />
          )}
        </div>
        {configured && <StatsGrid profile={profile!} zoneCount={zoneCount} />}
      </CardContent>
    </Card>
  );
};

const Identity: FC<{ profile: BuildingProfile; orgName: string | null }> = ({
  profile,
  orgName,
}) => {
  const { t } = useTranslation("home");
  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {profile.name || t("identity.defaultName")}
      </h2>
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
        {profile.address ? (
          <span>{profile.address}</span>
        ) : (
          <span className="italic">{t("identity.addressEmpty")}</span>
        )}
      </div>
      <ConnectionBadge orgName={orgName} />
    </div>
  );
};

/** Live badge: reflects the device-updates WebSocket, suffixed with the root
 *  org asset's name when it has one. */
const ConnectionBadge: FC<{ orgName: string | null }> = ({ orgName }) => {
  const { t } = useTranslation("home");
  const { isConnected } = useDeviceContext();
  const label = t(isConnected ? "identity.connected" : "identity.disconnected");
  return (
    <Badge
      variant={isConnected ? "success" : "secondary"}
      className="gap-1.5 font-medium"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isConnected ? "bg-status-ok" : "bg-muted-foreground",
        )}
      />
      {orgName ? `${label} · ${orgName}` : label}
    </Badge>
  );
};

const SetupPrompt: FC = () => {
  const { t } = useTranslation("home");
  return (
    <Link
      to="/profile/edit"
      className="block rounded-lg border border-dashed border-border px-6 py-4 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <div className="flex items-center gap-2">
        <Pencil className="h-4 w-4 shrink-0" />
        <TypographyH5>{t("setup.title")}</TypographyH5>
      </div>
      <p className="mt-1 text-sm">{t("setup.description")}</p>
    </Link>
  );
};

const StatsGrid: FC<{ profile: BuildingProfile; zoneCount: number }> = ({
  profile,
  zoneCount,
}) => {
  const { t, i18n } = useTranslation("home");
  const formatNumber = new Intl.NumberFormat(i18n.language).format;

  const stats = [
    {
      key: "surface",
      label: t("identity.surface"),
      value:
        profile.surface != null
          ? t("units.surfaceSquareMeters", {
              value: formatNumber(profile.surface),
            })
          : null,
    },
    {
      key: "floors",
      label: t("identity.floors"),
      value: profile.floors != null ? formatNumber(profile.floors) : null,
    },
    {
      key: "yearBuilt",
      label: t("identity.yearBuilt"),
      // Years are labels, not quantities — no thousands separator.
      value: profile.year_built != null ? String(profile.year_built) : null,
    },
    {
      key: "zones",
      label: t("identity.zones"),
      value: formatNumber(zoneCount),
    },
  ];

  return (
    <div className="divide-y divide-border border-t border-border">
      {[stats.slice(0, 2), stats.slice(2)].map((row) => (
        <div
          key={row[0].key}
          className="grid grid-cols-2 divide-x divide-border"
        >
          {row.map((stat) => (
            <div key={stat.key} className="px-6 py-4">
              <TypographySmall className="block uppercase tracking-[0.18em]">
                {stat.label}
              </TypographySmall>
              <p
                className={cn(
                  "mt-1 font-display text-xl font-semibold tabular-nums",
                  stat.value ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {stat.value ?? <EmptyValue />}
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

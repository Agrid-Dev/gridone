import { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import type { Asset, Device } from "@gridone/sdk";
import { Button } from "@/components/ui";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceContext } from "@/contexts/DeviceContext";
import { useBuildingProfile } from "@/hooks/useBuildingProfile";
import { countZones, findOrgName } from "./rollup";
import { IdentityCard } from "./IdentityCard";
import { NotificationsCard } from "./NotificationsCard";
import { DevicesCard } from "./DevicesCard";
import { ZonesByLevelCard } from "./ZonesByLevelCard";

/** Building page: identity + recent notifications on the left, the device
 *  fleet and the per-floor zone breakdown on the right. All cards derive from
 *  the queries below — no endpoint specific to this page. */
const Home: FC = () => {
  const { t } = useTranslation("home");
  const client = useGridoneClient();
  const can = usePermissions();

  const { data: profile, isLoading: profileLoading } = useBuildingProfile();
  const { isConnected } = useDeviceContext();
  // The exact ["devices"] key is the one the WebSocket handler patches in
  // place — the 3D viewer's live room temperatures ride on it. Polling is
  // only the fallback when the socket is down.
  const { data: devices, isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => client.devices.list(),
    refetchInterval: isConnected ? false : 15_000,
  });
  const { data: assets, isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["home", "assets-flat"],
    queryFn: () => client.assets.list(),
  });

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {can("assets:write") && (
          <Button asChild variant="outline">
            <Link to="/profile/edit">
              <Pencil className="h-4 w-4" />
              {t("editProfile")}
            </Link>
          </Button>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <IdentityCard
            profile={profile}
            zoneCount={countZones(assets ?? [])}
            orgName={findOrgName(assets ?? [])}
            loading={profileLoading || assetsLoading}
          />
        </div>
        <div className="lg:col-span-7">
          <DevicesCard devices={devices ?? []} loading={devicesLoading} />
        </div>
        {/* Full-width hero: hosts the 3D digital twin when a model exists. */}
        <div className="lg:col-span-12">
          <ZonesByLevelCard
            assets={assets ?? []}
            devices={devices ?? []}
            loading={assetsLoading || devicesLoading}
          />
        </div>
        <div className="lg:col-span-12">
          <NotificationsCard />
        </div>
      </div>
    </section>
  );
};

export default Home;

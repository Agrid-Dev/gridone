import { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Asset, Device } from "@gridone/sdk";
import { CardHeaderLink } from "./CardHeaderLink";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { buildFloorRows } from "./rollup";
import { FloorStackDiagram } from "./FloorStackDiagram";

/** Visual breakdown of the asset tree, one layer per floor with its zone count. */
export const ZonesByLevelCard: FC<{
  assets: Asset[];
  devices: Device[];
  loading: boolean;
}> = ({ assets, devices, loading }) => {
  const { t } = useTranslation("home");
  const can = usePermissions();

  const rows = buildFloorRows(assets, devices);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t("zonesByLevel.title")}</CardTitle>
        <CardHeaderLink to="/assets">
          {t("zonesByLevel.viewAll")}
        </CardHeaderLink>
      </CardHeader>
      <CardContent>
        {loading ? (
          <DiagramSkeleton />
        ) : rows.length > 0 ? (
          <FloorStackDiagram rows={rows} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("zonesByLevel.empty")}{" "}
            {can("assets:write") && (
              <Link
                to="/assets/new"
                className="font-medium text-primary hover:underline"
              >
                {t("zonesByLevel.addZone")}
              </Link>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const DiagramSkeleton: FC = () => <Skeleton className="h-48 w-full" />;

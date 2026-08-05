import { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Asset, Device } from "@gridone/sdk";
import { CardHeaderLink } from "./CardHeaderLink";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Th,
} from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { buildFloorRows } from "./rollup";

/** Per-floor breakdown of the asset tree: zone and device counts, one row per
 *  floor asset in curated tree order, each linking to the floor's page. */
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
          <TableSkeleton />
        ) : rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th className="px-0">{t("zonesByLevel.level")}</Th>
                <Th className="px-0 text-right">{t("zonesByLevel.zones")}</Th>
                <Th className="px-0 text-right">{t("zonesByLevel.devices")}</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ floor, zoneCount, deviceCount }) => (
                <TableRow key={floor.id}>
                  <TableCell className="px-0 py-2.5">
                    <Link
                      to={`/assets/${floor.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {floor.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-0 py-2.5 text-right tabular-nums">
                    {zoneCount}
                  </TableCell>
                  <TableCell className="px-0 py-2.5 text-right tabular-nums">
                    {deviceCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

const TableSkeleton: FC = () => (
  <div className="space-y-2">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-8 w-full rounded-md" />
    ))}
  </div>
);

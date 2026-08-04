import { FC, ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Asset, Device } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { CardHeaderLink } from "./CardHeaderLink";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
                <HeadCell>{t("zonesByLevel.level")}</HeadCell>
                <HeadCell className="text-right">
                  {t("zonesByLevel.zones")}
                </HeadCell>
                <HeadCell className="text-right">
                  {t("zonesByLevel.devices")}
                </HeadCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ floor, zoneCount, deviceCount }) => (
                <TableRow key={floor.id}>
                  <TableCell className="px-0 py-3">
                    <Link
                      to={`/assets/${floor.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {floor.name}
                    </Link>
                  </TableCell>
                  <TableCell className="px-0 py-3 text-right tabular-nums">
                    {zoneCount}
                  </TableCell>
                  <TableCell className="px-0 py-3 text-right tabular-nums">
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

const HeadCell: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <TableHead
    className={cn(
      "h-10 px-0 text-xs font-semibold uppercase tracking-wider",
      className,
    )}
  >
    {children}
  </TableHead>
);

const TableSkeleton: FC = () => (
  <div className="space-y-2">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-8 w-full rounded-md" />
    ))}
  </div>
);

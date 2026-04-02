import React, { FC } from "react";
import { useDrivers } from "./useDrivers";
import { Driver } from "@/api/drivers";
import { Card, CardContent, CardHeader } from "@/components/ui";
import { TypographyH3 } from "@/components/ui/typography";
import { Link, useSearchParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui";
import { Plus } from "lucide-react";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";
import { useFilterParams } from "@/hooks/useFilterParams";
import { TypeFilter } from "@/components/FilterBar";

const DriverCard: FC<{ driver: Driver }> = ({ driver }) => {
  const { t } = useTranslation("drivers");
  return (
    <Link to={driver.id} className="block h-full no-underline">
      <Card>
        <CardHeader className="truncate">
          <TypographyH3>{driver.id}</TypographyH3>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <DeviceTypeChip type={driver.type} />
          <Badge variant="secondary">{driver.transport}</Badge>
          <Badge variant="outline">
            {driver.attributes.length}&nbsp;
            {t("attribute", { count: driver.attributes.length })}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
};

const DriversListContainer: FC<{
  driversCount: number;
  children: React.ReactNode;
}> = ({ driversCount, children }) => {
  const { t } = useTranslation("drivers");
  const can = usePermissions();
  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("title")}
        title={t("list", { count: driversCount })}
        actions={
          can("drivers:write") ? (
            <Button asChild>
              <Link to="new">
                <Plus />
                {t("actions.create")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <TypeFilter />
      {driversCount > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {children}
        </div>
      ) : (
        <div>{children}</div>
      )}
    </section>
  );
};

const DriversList: FC<{ drivers: Driver[]; hasFilters: boolean }> = ({
  drivers,
  hasFilters,
}) => {
  const [, setSearchParams] = useSearchParams();
  return (
    <DriversListContainer driversCount={drivers.length}>
      {drivers.length ? (
        drivers.map((driver) => <DriverCard key={driver.id} driver={driver} />)
      ) : (
        <ResourceEmpty
          resourceName="driver"
          filtered={hasFilters}
          onClearFilters={() => setSearchParams({})}
        />
      )}
    </DriversListContainer>
  );
};

const DriversListLoader: FC = () => (
  <DriversListContainer driversCount={0}>
    {Array.from({ length: 6 }).map((_, index) => (
      <Skeleton key={index} className="h-40" />
    ))}
  </DriversListContainer>
);

const DriversListWrapper: FC = () => {
  const filters = useFilterParams();
  const { driversListQuery: query } = useDrivers(filters);
  if (query.isLoading) {
    return <DriversListLoader />;
  }
  const drivers = query.data;
  return <DriversList drivers={drivers} hasFilters={!!filters} />;
};
export default DriversListWrapper;

import React, { FC } from "react";
import { useDrivers } from "./useDrivers";
import { Driver } from "@/api/drivers";
import { Card } from "@/components/ui";
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
import { FilterIndicator, TypeFilter } from "@/components/FilterBar";

const DriverCard: FC<{ driver: Driver }> = ({ driver }) => {
  const { t } = useTranslation("drivers");
  return (
    <Link to={driver.id} className="group block h-full no-underline">
      <Card className="card-glow flex h-full flex-col justify-between gap-2 p-4 transition-all duration-200 hover:-translate-y-0.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="ml-auto">
              <DeviceTypeChip type={driver.type} />
            </span>
          </div>
          <h2 className="mt-0.5 min-w-0 truncate font-display text-base font-semibold text-card-foreground">
            {driver.id}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="info">{driver.transport}</Badge>
          <Badge variant="outline" className="text-[10px]">
            {driver.attributes.length}&nbsp;
            {t("attribute", { count: driver.attributes.length })}
          </Badge>
        </div>
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
        title={t("title")}
        caption={t("caption")}
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
      <div className="flex flex-wrap items-center gap-3">
        <FilterIndicator />
        <TypeFilter />
      </div>
      {driversCount > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

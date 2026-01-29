import React, { FC } from "react";
import { useDrivers } from "./useDrivers";
import { Driver } from "@/api/drivers";
import { Card, CardContent, CardHeader } from "@/components/ui";
import { TypographyH3 } from "@/components/ui/typography";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui";
import { Plus } from "lucide-react";
import { ResourceHeader } from "@/components/ResourceHeader";

const DriverCard: FC<{ driver: Driver }> = ({ driver }) => {
  const { t } = useTranslation();
  return (
    <Link to={driver.id} className="block h-full no-underline">
      <Card>
        <CardHeader className="truncate">
          <TypographyH3>{driver.id}</TypographyH3>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{driver.transport}</Badge>
          <Badge variant="outline">
            {driver.attributes.length}&nbsp;
            {t("drivers.attribute", { count: driver.attributes.length })}
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
  const { t } = useTranslation();
  return (
    <>
      <ResourceHeader
        resourceName={t("drivers.title")}
        title={t("drivers.list", { count: driversCount })}
        actions={
          <Button asChild variant="outline">
            <Link to="new">
              <Plus />
              {t("drivers.actions.create")}
            </Link>
          </Button>
        }
      />
      {driversCount > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {children}
        </div>
      ) : (
        <div>{children}</div>
      )}
    </>
  );
};

const DriversList: FC<{ drivers: Driver[] }> = ({ drivers }) => {
  return (
    <DriversListContainer driversCount={drivers.length}>
      {drivers.length ? (
        drivers.map((driver) => <DriverCard key={driver.id} driver={driver} />)
      ) : (
        <ResourceEmpty resourceName="driver" />
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
  const { driversListQuery: query } = useDrivers();
  if (query.isLoading) {
    return <DriversListLoader />;
  }
  const drivers = query.data;
  return <DriversList drivers={drivers} />;
};
export default DriversListWrapper;

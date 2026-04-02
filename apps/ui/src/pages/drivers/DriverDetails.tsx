import React, { FC } from "react";
import { useDrivers } from "./useDrivers";
import { useParams } from "react-router";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { useTranslation } from "react-i18next";
import { type Driver, type DriverAttribute } from "@/api/drivers";
import {
  TypographyH3,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";
import { Card, CardContent } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { toLabel } from "@/lib/textFormat";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ErrorBoundary } from "react-error-boundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import { usePermissions } from "@/contexts/AuthContext";

const LabelledProperty: FC<{
  label: React.ReactNode;
  value: string | number | boolean | React.ReactNode | undefined;
}> = ({ label, value }) => (
  <div>
    <Label>{label}</Label>
    <TypographyP>
      {value !== null && value !== undefined ? value : "N/A"}
    </TypographyP>
  </div>
);

const DriverAttributeItem: FC<{ attribute: DriverAttribute }> = ({
  attribute,
}) => {
  const readWriteSupportLabel = ["read", "write"]
    .filter((key) => attribute[key as keyof DriverAttribute])
    .map((key) => key[0].toUpperCase())
    .join("/");
  return (
    <li className="flex gap-2 align-center justify-start pb-1">
      <div className="w-52">
        <TypographyP>{toLabel(attribute.name)}</TypographyP>
      </div>
      <div className="w-12">
        <Badge variant="secondary">{attribute.dataType}</Badge>
      </div>
      <div className="w-12">
        <Badge variant="outline">{readWriteSupportLabel}</Badge>
      </div>
    </li>
  );
};

const DriverDetails: FC<{
  driver: Driver;
  onDelete: (driverId: string) => Promise<void>;
}> = ({ driver, onDelete }) => {
  const { t } = useTranslation("drivers");
  const can = usePermissions();
  return (
    <div className="space-y-6">
      <ResourceHeader
        resourceName={t("title")}
        title={driver.id}
        resourceNameLinksBack
        backTo="/drivers"
      />
      <Card className="py-4">
        <CardContent>
          <TypographyH3>Informations générales</TypographyH3>

          <div className="flex justify-start gap-16 my-4">
            <LabelledProperty
              label={t("fields.vendor")}
              value={driver.vendor}
            />
            <LabelledProperty label={t("fields.model")} value={driver.model} />
            <LabelledProperty
              label={t("fields.version")}
              value={driver.version}
            />
            <LabelledProperty
              label={t("fields.protocol")}
              value={driver.transport}
            />
            <LabelledProperty
              label={t("fields.type")}
              value={<DeviceTypeChip type={driver.type} />}
            />
          </div>
          <TypographyH3>{t("fields.updateStrategy")}</TypographyH3>
          <div className="flex justify-start gap-16 my-4">
            {Object.entries(driver.updateStrategy).map(([key, value]) => (
              <LabelledProperty key={key} label={toLabel(key)} value={value} />
            ))}
          </div>
          <div className="my-4">
            <TypographyH3>{t("fields.deviceConfig")}</TypographyH3>
            <TypographySmall>
              {t("fields.deviceConfigDescription")}
            </TypographySmall>
            <TypographyP>
              {driver.deviceConfig.length > 0 ? (
                <b>{driver.deviceConfig.map(({ name }) => name).join(", ")}</b>
              ) : (
                t("fields.none")
              )}
            </TypographyP>
          </div>
          <div className="my-4">
            <TypographyH3>
              {toLabel(t("attribute", { count: driver.attributes.length }))}
            </TypographyH3>
            <ul>
              {driver.attributes.map((attribute) => (
                <DriverAttributeItem
                  key={attribute.name}
                  attribute={attribute}
                />
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
      {can("drivers:write") && (
        <DangerZone
          onDelete={() => {
            onDelete(driver.id);
          }}
          confirmTitle={t("actions.deleteConfirmTitle")}
          confirmDetails={t("actions.deleteConfirmDetails")}
          deleteLabel={t("actions.delete")}
        />
      )}
    </div>
  );
};

const DriverDetailsWrapper: FC = () => {
  const { driversListQuery: query, handleDelete } = useDrivers();
  const { driverId } = useParams();
  const { t } = useTranslation("drivers");
  if (query.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </section>
    );
  }
  if (!driverId) {
    return <ErrorFallback />;
  }
  const driver = query.data.find((d) => d.id == driverId);
  if (!driver) {
    return <NotFoundFallback message={t("notFoundDetails", { driverId })} />;
  }
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DriverDetails driver={driver} onDelete={handleDelete} />
    </ErrorBoundary>
  );
};

export default DriverDetailsWrapper;

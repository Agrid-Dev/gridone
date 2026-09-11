import React, { FC } from "react";
import { useDriverFromRoute, useDeleteDriver } from "./useDrivers";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Driver, DriverAttribute } from "@gridone/sdk";
import {
  TypographyH3,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";
import { Button, Card, CardContent } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { toLabel } from "@/lib/textFormat";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { usePermissions } from "@/contexts/AuthContext";
import { DriverDevicesSection } from "./DriverDevicesSection";
import { DriverPresentationStatus } from "./DriverPresentationStatus";
import { useExportDriverPackage } from "./useDriverPackage";
import { GroupError, groupConflict } from "@/pages/devices/groups/GroupError";

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
        <Badge variant="secondary">{attribute.data_type}</Badge>
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
  const { exportPackage, exporting } = useExportDriverPackage(driver.id);
  return (
    <div className="space-y-6">
      <ResourceHeader
        title={driver.id}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={exporting}
              onClick={exportPackage}
            >
              {t("package.export")}
            </Button>
            {can("drivers:write") && (
              <>
                <Button asChild variant="outline">
                  <Link to="edit">{t("package.replace")}</Link>
                </Button>
                <ResourceDeleteButton
                  onDelete={() => onDelete(driver.id)}
                  confirmTitle={t("actions.deleteConfirmTitle")}
                  confirmDetails={t("actions.deleteConfirmDetails")}
                  deleteLabel={t("actions.delete")}
                />
              </>
            )}
          </div>
        }
      />
      <Card className="py-4">
        <CardContent>
          <TypographyH3>{t("fields.general")}</TypographyH3>
          {driver.image_src && (
            <div className="my-4">
              <img
                src={driver.image_src}
                alt={driver.id}
                className="h-40 w-40 rounded-lg object-cover"
              />
            </div>
          )}
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
              value={<DeviceTypeChip type={driver.type ?? null} />}
            />
          </div>
          <TypographyH3>{t("fields.updateStrategy")}</TypographyH3>
          <div className="flex justify-start gap-16 my-4">
            {Object.entries(driver.update_strategy ?? {}).map(
              ([key, value]) => (
                <LabelledProperty
                  key={key}
                  label={toLabel(key)}
                  value={
                    typeof value === "object" && value !== null
                      ? Object.entries(value)
                          .map(
                            ([groupName, interval]) =>
                              `${groupName}: ${interval}s`,
                          )
                          .join(", ")
                      : value
                  }
                />
              ),
            )}
          </div>
          <div className="my-4">
            <TypographyH3>{t("fields.deviceConfig")}</TypographyH3>
            <TypographySmall>
              {t("fields.deviceConfigDescription")}
            </TypographySmall>
            <TypographyP>
              {driver.device_config.length > 0 ? (
                <b>{driver.device_config.map(({ name }) => name).join(", ")}</b>
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
      <Card className="py-4">
        <CardContent>
          <DriverPresentationStatus driverId={driver.id} />
        </CardContent>
      </Card>
      <DriverDevicesSection driverId={driver.id} />
    </div>
  );
};

const DriverDetailsContent: FC = () => {
  const driver = useDriverFromRoute();
  const { handleDelete, error } = useDeleteDriver();
  return (
    <>
      <GroupError error={groupConflict(error) ? error : null} />
      <DriverDetails driver={driver} onDelete={handleDelete} />
    </>
  );
};

const DriverDetailsWrapper: FC = () => {
  const { driverId } = useParams();
  return (
    <ResourceBoundary resetKeys={[driverId]}>
      <DriverDetailsContent />
    </ResourceBoundary>
  );
};

export default DriverDetailsWrapper;

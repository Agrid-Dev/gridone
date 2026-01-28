import React, { FC } from "react";
import { useDrivers } from "./useDrivers";
import { useParams, Link } from "react-router";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { useTranslation } from "react-i18next";
import { type Driver, type DriverAttribute } from "@/api/drivers";
import {
  TypographyH2,
  TypographyEyebrow,
  TypographyH3,
  TypographyP,
  TypographySmall,
} from "@/components/ui/typography";
import { Card, CardContent } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { toLabel } from "@/lib/textFormat";
import { Badge } from "@/components/ui/badge";
import { ErrorBoundary } from "react-error-boundary";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Trash } from "lucide-react";

const LabelledProperty: FC<{
  label: React.ReactNode;
  value: string | number | boolean | null | undefined;
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
    <li className="flex gap-2 align-baseline justify-start py-1">
      <TypographyP>{toLabel(attribute.name)}</TypographyP>
      <Badge variant="secondary">{attribute.dataType}</Badge>
      <Badge variant="outline">{readWriteSupportLabel}</Badge>
    </li>
  );
};

const DriverDetails: FC<{ driver: Driver }> = ({ driver }) => {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex justify-between items-end">
        <div>
          <Link to="..">
            <TypographyEyebrow>{t("drivers.title")}</TypographyEyebrow>
          </Link>
          <div className="mt-1">
            <TypographyH2>{driver.id}</TypographyH2>
          </div>
        </div>
        <ConfirmButton
          variant="destructive"
          onConfirm={() => {
            console.log("deleted");
          }}
          confirmTitle="Are you sure?"
          confirmDetails="This will permanently delete the driver."
          icon={<Trash />}
        >
          Delete it
        </ConfirmButton>
      </div>
      <Card className="mt-4 py-4">
        <CardContent>
          <TypographyH3>Informations générales</TypographyH3>
          <div className="flex justify-start gap-16 my-4">
            <LabelledProperty
              label={t("drivers.fields.vendor")}
              value={driver.vendor}
            />
            <LabelledProperty
              label={t("drivers.fields.model")}
              value={driver.model}
            />
            <LabelledProperty
              label={t("drivers.fields.version")}
              value={driver.version}
            />
            <LabelledProperty
              label={t("drivers.fields.protocol")}
              value={driver.transport}
            />
          </div>
          <TypographyH3>{t("drivers.fields.updateStrategy")}</TypographyH3>
          <div className="flex justify-start gap-16 my-4">
            {Object.entries(driver.updateStrategy).map(([key, value]) => (
              <LabelledProperty key={key} label={toLabel(key)} value={value} />
            ))}
          </div>
          <div className="my-4">
            <TypographyH3>{t("drivers.fields.deviceConfig")}</TypographyH3>
            <TypographySmall>
              {t("drivers.fields.deviceConfigDescription")}
            </TypographySmall>
            <TypographyP>
              {driver.deviceConfig.length > 0 ? (
                <b>{driver.deviceConfig.map(({ name }) => name).join(", ")}</b>
              ) : (
                t("drivers.fields.none")
              )}
            </TypographyP>
          </div>
          <div className="my-4">
            <TypographyH3>
              {toLabel(
                t("drivers.attribute", { count: driver.attributes.length }),
              )}
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
    </div>
  );
};

const DriverDetailsWrapper: FC = () => {
  const { driversListQuery: query } = useDrivers();
  const { driverId } = useParams();
  const { t } = useTranslation();
  if (query.isLoading) {
    return <h1>loading</h1>;
  }
  if (!driverId) {
    return <ErrorFallback />;
  }
  const driver = query.data.find((d) => d.id == driverId);
  if (!driver) {
    return (
      <NotFoundFallback message={t("drivers.notFoundDetails", { driverId })} />
    );
  }
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DriverDetails driver={driver} />
    </ErrorBoundary>
  );
};

export default DriverDetailsWrapper;

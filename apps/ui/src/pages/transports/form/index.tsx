import { Transport, TransportSchemas } from "@/api/transports";
import React, { FC } from "react";
import {
  useTransportForm,
  useTransportConfigSchemas,
} from "./useTransportForm";
import { TypographyH3, TypographyEyebrow } from "@/components/ui/typography";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { Button } from "@/components/ui";
import { transportProtocols } from "@/api/transports";
import { useTranslation } from "react-i18next";
import { toLabel } from "@/lib/textFormat";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/fallbacks/Error";

interface TransportFormProps {
  configSchemas: TransportSchemas;
  transport?: Transport;
}

const TransportForm: FC<TransportFormProps> = ({
  transport,
  configSchemas,
}) => {
  const { t } = useTranslation();
  const {
    baseFormMethods,
    configFormMethods,
    jsonSchema,
    handleSubmit,
    isSubmitting,
    handleCancel,
    isCreate,
  } = useTransportForm(configSchemas, transport);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit();
  };
  const requiredSet = new Set(jsonSchema?.required ?? []);

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <TypographyEyebrow>
            {isCreate ? t("transports.createTitle") : t("transports.editTitle")}
          </TypographyEyebrow>
          <TypographyH3>
            {isCreate
              ? t("transports.createSubtitle")
              : t("transports.editSubtitle")}
          </TypographyH3>
        </div>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSubmit}
          id="transport-form"
          className="grid gap-4 md:grid-cols-2"
        >
          <InputController
            name="name"
            control={baseFormMethods.control}
            label={t("transports.fields.name")}
            required
          />
          <SelectController
            name="protocol"
            control={baseFormMethods.control}
            label={t("transports.fields.protocol")}
            options={transportProtocols.map((protocol) => ({
              value: protocol,
              label: protocol,
            }))}
            required
            disabled={!isCreate}
            title={t("transports.fields.protocolDisabled")}
          />
          {jsonSchema &&
            Object.entries(jsonSchema.properties || {}).map(
              ([propertyName, property]) => (
                <InputController
                  key={propertyName}
                  name={propertyName}
                  control={configFormMethods.control}
                  label={toLabel(propertyName)}
                  type={property.type}
                  required={requiredSet.has(propertyName)}
                  description={property.description}
                  inputProps={{
                    placeholder: property.default
                      ? String(property.default)
                      : undefined,
                  }}
                />
              ),
            )}
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" type="button" onClick={handleCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          form="transport-form"
          disabled={
            !(
              baseFormMethods.formState.isValid ||
              configFormMethods.formState.isValid
            ) || isSubmitting
          }
        >
          {isSubmitting
            ? t("transports.saving")
            : isCreate
              ? t("transports.createAction")
              : t("transports.updateAction")}
        </Button>
      </CardFooter>
    </Card>
  );
};

const TransportFormWrapper: FC<{ transport?: Transport }> = ({ transport }) => {
  const { isLoading, configSchemas } = useTransportConfigSchemas();
  const { t } = useTranslation();
  if (isLoading) {
    return <p>Loading</p>;
  }
  if (!configSchemas) {
    return <h1>Oh no error</h1>;
  }
  return (
    <ErrorBoundary fallback={<ErrorFallback title={t("errors.default")} />}>
      <TransportForm transport={transport} configSchemas={configSchemas} />
    </ErrorBoundary>
  );
};

export default TransportFormWrapper;

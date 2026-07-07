import {
  Transport,
  TransportProtocol,
  TransportSchemas,
} from "@/api/transports";
import React, { FC } from "react";
import {
  useTransportForm,
  useTransportConfigSchemas,
  type TransportFormCallbacks,
} from "./useTransportForm";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { Button } from "@/components/ui";
import { transportProtocols } from "@/api/transports";
import { useTranslation } from "react-i18next";
import { toLabel } from "@/lib/textFormat";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/fallbacks/Error";

export type TransportFormProps = TransportFormCallbacks & {
  configSchemas: TransportSchemas;
  transport?: Transport;
  lockedProtocol?: TransportProtocol;
  formId?: string;
};

const TransportForm: FC<TransportFormProps> = ({
  transport,
  configSchemas,
  lockedProtocol,
  onCreated,
  onUpdated,
  onCancel,
  formId = "transport-form",
}) => {
  const { t } = useTranslation(["transports", "common"]);
  const {
    baseFormMethods,
    configFormMethods,
    jsonSchema,
    handleSubmit,
    isSubmitting,
    handleCancel,
    isCreate,
    revealedSecrets,
    revealSecret,
    isSecretConfigured,
  } = useTransportForm(configSchemas, transport, {
    lockedProtocol,
    onCreated,
    onUpdated,
    onCancel,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit();
  };
  const requiredSet = new Set(jsonSchema?.required ?? []);
  const protocolLocked = !isCreate || lockedProtocol !== undefined;

  return (
    <div className="space-y-4">
      <form
        onSubmit={onSubmit}
        id={formId}
        className="grid gap-4 md:grid-cols-2"
      >
        <InputController
          name="name"
          control={baseFormMethods.control}
          label={t("fields.name")}
          required
        />
        <SelectController
          name="protocol"
          control={baseFormMethods.control}
          label={t("fields.protocol")}
          options={transportProtocols.map((protocol) => ({
            value: protocol,
            label: protocol,
          }))}
          required
          disabled={protocolLocked}
          title={protocolLocked ? t("fields.protocolDisabled") : undefined}
        />
        {jsonSchema &&
          Object.entries(jsonSchema.properties || {}).map(
            ([propertyName, property]) => {
              if (
                property.secret &&
                isSecretConfigured(propertyName) &&
                !revealedSecrets.has(propertyName)
              ) {
                return (
                  <FieldShell
                    key={propertyName}
                    id={propertyName}
                    label={toLabel(propertyName)}
                    description={property.description}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {t("fields.secretConfigured")}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => revealSecret(propertyName)}
                      >
                        {t("fields.secretReplace")}
                      </Button>
                    </div>
                  </FieldShell>
                );
              }
              return (
                <InputController
                  key={propertyName}
                  name={propertyName}
                  control={configFormMethods.control}
                  label={toLabel(propertyName)}
                  type={property.secret ? "password" : property.type}
                  required={requiredSet.has(propertyName)}
                  description={property.description}
                  inputProps={{
                    placeholder: property.default
                      ? String(property.default)
                      : undefined,
                  }}
                />
              );
            },
          )}
      </form>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
        <Button variant="outline" type="button" onClick={handleCancel}>
          {t("common:common.cancel")}
        </Button>
        <Button
          type="submit"
          form={formId}
          disabled={
            !(
              baseFormMethods.formState.isValid ||
              configFormMethods.formState.isValid
            ) || isSubmitting
          }
        >
          {isSubmitting
            ? t("saving")
            : isCreate
              ? t("createAction")
              : t("updateAction")}
        </Button>
      </div>
    </div>
  );
};

const TransportFormWrapper: FC<
  TransportFormCallbacks & {
    transport?: Transport;
    lockedProtocol?: TransportProtocol;
    formId?: string;
  }
> = (props) => {
  const { isLoading, configSchemas } = useTransportConfigSchemas();
  const { t } = useTranslation(["transports", "common"]);
  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("common:common.loading")}
      </p>
    );
  }
  if (!configSchemas) {
    return (
      <p className="text-sm text-destructive">{t("unableToLoadSchemas")}</p>
    );
  }
  return (
    <ErrorBoundary
      fallback={<ErrorFallback title={t("common:errors.default")} />}
    >
      <TransportForm {...props} configSchemas={configSchemas} />
    </ErrorBoundary>
  );
};

export default TransportFormWrapper;

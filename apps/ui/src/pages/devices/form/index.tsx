import React from "react";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { Button } from "@/components/ui";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useDeviceForm } from "./useDeviceForm";
import { useTranslation } from "react-i18next";
import { Device } from "@/api/devices";

type DeviceFormProps = {
  device?: Device;
};

const DeviceForm: React.FC<DeviceFormProps> = ({ device }) => {
  const {
    baseFormMethods,
    configFormMethods,
    driverOptions,
    transportOptions,
    configFields,
    selectedDriver,
    driversLoading,
    transportsLoading,
    transportsError,
    isPending,
    handleSubmit,
    handleCancel,
    submitDisabled,
  } = useDeviceForm(device);

  const { t } = useTranslation();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await handleSubmit();
  };

  return (
    <Card>
      <CardContent className="my-8">
        <form
          id="device-form"
          onSubmit={onSubmit}
          className="grid gap-4 md:grid-cols-2"
        >
          <SelectController
            name="driverId"
            control={baseFormMethods.control}
            label={t("devices.fields.driver")}
            options={driverOptions}
            placeholder={t("devices.fields.driverPlaceholder", {
              defaultValue: "Select a driver",
            })}
            required
            rules={{ required: true }}
            disabled={driversLoading}
          />
          <InputController
            name="name"
            control={baseFormMethods.control}
            label={t("devices.fields.name")}
            required
            rules={{ required: true }}
          />
          <SelectController
            name="transportId"
            control={baseFormMethods.control}
            label={t("devices.fields.transport")}
            options={transportOptions}
            placeholder={t("devices.fields.transportPlaceholder", {
              defaultValue: "Select a transport",
            })}
            required
            rules={{ required: true }}
            disabled={!selectedDriver || transportsLoading}
            title={
              selectedDriver
                ? undefined
                : t("devices.fields.transportDisabled", {
                    defaultValue: "Select a driver first",
                  })
            }
          />
          {transportsError && (
            <p className="text-sm text-destructive md:col-span-2">
              {t("transports.unableToLoad")}
            </p>
          )}
          {configFields.map((field) => (
            <InputController
              key={field.name}
              name={field.name}
              control={configFormMethods.control}
              label={field.label}
              required={field.required}
              rules={{ required: field.required }}
            />
          ))}
          {selectedDriver && configFields.length === 0 && (
            <p className="text-sm text-muted-foreground md:col-span-2">
              {t("common.noConfiguration")}
            </p>
          )}
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" type="button" onClick={handleCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" form="device-form" disabled={submitDisabled}>
          {isPending
            ? t("devices.saving")
            : device
              ? t("devices.actions.update")
              : t("devices.actions.create")}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default DeviceForm;

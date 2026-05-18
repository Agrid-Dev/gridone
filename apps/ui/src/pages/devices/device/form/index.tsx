import React from "react";
import { Plus, Pencil } from "lucide-react";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { Button } from "@/components/ui";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useDeviceForm } from "./useDeviceForm";
import { useTranslation } from "react-i18next";
import { PhysicalDevice } from "@/api/devices";
import { NetworkModal } from "@/components/NetworkModal";
import { DeviceDiscoverySwitch } from "@/components/DeviceDiscoverySwitch";

type DeviceFormProps = {
  device?: PhysicalDevice;
};

const DeviceForm: React.FC<DeviceFormProps> = ({ device }) => {
  const {
    baseFormMethods,
    configFormMethods,
    driverOptions,
    transportOptions,
    configFields,
    selectedDriver,
    selectedTransport,
    driversLoading,
    transportsLoading,
    transportsError,
    isPending,
    handleSubmit,
    handleCancel,
    submitDisabled,
    networkModalState,
    openCreateNetworkModal,
    openEditNetworkModal,
    closeNetworkModal,
    onNetworkSubmitted,
    discovery,
  } = useDeviceForm(device);

  const { t } = useTranslation(["devices", "common"]);

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
          <InputController
            name="name"
            control={baseFormMethods.control}
            label={t("devices.fields.name")}
            required
            rules={{ required: true }}
          />
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

          <div className="md:col-span-2 grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-end">
            <SelectController
              name="transportId"
              control={baseFormMethods.control}
              label={t("devices.fields.transport")}
              options={transportOptions}
              placeholder={t("devices.fields.transportPlaceholder", {
                defaultValue: "Select a network",
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
            <Button
              type="button"
              variant="outline"
              onClick={openCreateNetworkModal}
              disabled={!selectedDriver}
            >
              <Plus className="h-4 w-4" />
              {t("devices.fields.createNetworkAction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openEditNetworkModal}
              disabled={!selectedTransport}
              title={t("devices.fields.editNetworkAction")}
              aria-label={t("devices.fields.editNetworkAction")}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
          {transportsError && (
            <p className="text-sm text-destructive md:col-span-2">
              {t("devices.fields.transportLoadError")}
            </p>
          )}
          {discovery.supported && (
            <DeviceDiscoverySwitch
              checked={discovery.enabled}
              onCheckedChange={discovery.setEnabled}
              loading={discovery.loading}
            />
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
              {t("common:common.noConfiguration")}
            </p>
          )}
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" type="button" onClick={handleCancel}>
          {t("common:common.cancel")}
        </Button>
        <Button type="submit" form="device-form" disabled={submitDisabled}>
          {isPending
            ? t("devices.saving")
            : device
              ? t("devices.actions.update")
              : t("devices.actions.create")}
        </Button>
      </CardFooter>

      <NetworkModal
        open={networkModalState !== null}
        onClose={closeNetworkModal}
        mode={networkModalState?.mode ?? "create"}
        protocol={
          networkModalState?.mode === "create"
            ? networkModalState.protocol
            : undefined
        }
        transport={
          networkModalState?.mode === "edit"
            ? networkModalState.transport
            : undefined
        }
        onSubmitted={onNetworkSubmitted}
      />
    </Card>
  );
};

export default DeviceForm;

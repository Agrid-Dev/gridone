import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import snakecaseKeys from "snakecase-keys";
import { useDrivers } from "@/pages/drivers/useDrivers";
import { toLabel } from "@/lib/textFormat";
import type { Device, PhysicalDevice } from "@/api/devices";
import { InputController } from "@/components/forms/controllers/InputController";
import {
  Section,
  SectionRow,
  SectionEditButton,
  SectionActions,
} from "./Section";

type ConfigValues = Record<string, string>;

interface DriverConfigSectionProps {
  device: PhysicalDevice;
  isEditing: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (payload: Partial<Device>) => void;
}

/** The dynamic, driver-defined device config (JSON-schema fields). Field names
 *  come from the device's driver; values round-trip in snake_case to match the
 *  backend. */
export function DriverConfigSection({
  device,
  isEditing,
  canEdit,
  isSubmitting,
  onEdit,
  onCancel,
  onSave,
}: DriverConfigSectionProps) {
  const { t } = useTranslation(["devices", "common"]);
  const { driversListQuery } = useDrivers();
  const driver = driversListQuery.data?.find((d) => d.id === device.driverId);
  const fields = driver?.deviceConfig ?? [];

  // Config keys arrive camelCased from the API; the driver's field names are
  // snake_case (as authored in the driver YAML). Snake-case the stored config
  // so both the read view and the form key on the driver's field names.
  const configValues = useMemo(
    () => snakecaseKeys(device.config) as ConfigValues,
    [device.config],
  );
  const form = useForm<ConfigValues>({
    mode: "onChange",
    defaultValues: configValues,
  });

  const hasFields = fields.length > 0;
  const editable = canEdit && hasFields;

  return (
    <Section
      title={t("deviceDetails.config.config.title")}
      busy={isSubmitting}
      action={
        editable ? (
          <SectionEditButton
            label={t("deviceDetails.config.config.edit")}
            onClick={onEdit}
          />
        ) : undefined
      }
    >
      {!hasFields ? (
        <p className="py-2.5 text-sm text-muted-foreground">
          {t("common:common.noConfiguration")}
        </p>
      ) : isEditing ? (
        <form
          onSubmit={form.handleSubmit((values) => onSave({ config: values }))}
        >
          {fields.map((field) => {
            const label = toLabel(field.name);
            return (
              <SectionRow key={field.name} label={label}>
                <InputController
                  name={field.name}
                  control={form.control}
                  inputProps={{ "aria-label": label }}
                  rules={{ required: field.required }}
                />
              </SectionRow>
            );
          })}
          <SectionActions
            saveDisabled={!form.formState.isValid || !form.formState.isDirty}
            submitting={isSubmitting}
            onCancel={onCancel}
          />
        </form>
      ) : (
        fields.map((field) => (
          <SectionRow key={field.name} label={toLabel(field.name)}>
            {String(configValues[field.name] ?? "—")}
          </SectionRow>
        ))
      )}
    </Section>
  );
}

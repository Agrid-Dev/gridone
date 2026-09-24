import { useContext, useId } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { DataType } from "@gridone/sdk";
import { InputController } from "@/components/forms/controllers/InputController";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { ScalarInput } from "@/pages/devices/device/operating-rules/ConditionEditor";
import { AttributeSelect } from "@/pages/devices/device/operating-rules/AttributeSelect";
import {
  attributeType,
  defaultScalar,
  sameScalarType,
  scalarType,
} from "@/pages/devices/device/operating-rules/expressions";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomActionFormProps } from "../../presenters/types";
import { useAutomationCatalog } from "../../hooks/useAutomationCatalog";
import { TreeContext } from "../../tree/TreeContext";
import { useInlineWriteForm } from "./useInlineWriteForm";

const VALUE_TYPES = ["bool", "float", "str"] as const;

/** One static write: an attribute and its value, on a chosen device or on the
 *  triggering event's device. The value is typed by the attribute when the
 *  catalog knows it, and by an explicit type choice otherwise. */
export function InlineWriteFields(props: CustomActionFormProps) {
  const { t } = useTranslation("automations");
  const form = useInlineWriteForm(props);
  const catalog = useAutomationCatalog();
  // The event's device is known only inside the tree editor.
  const triggerDeviceId = useContext(TreeContext)?.trigger?.params?.device_id;
  const typeId = useId();
  const deviceId = form.watch("device_id");
  const attribute = form.watch("attribute");
  const targetDevice =
    deviceId ?? (typeof triggerDeviceId === "string" ? triggerDeviceId : null);
  const dataType =
    targetDevice && attribute
      ? attributeType(catalog, { device_id: targetDevice, attribute })
      : undefined;
  const retype = (type: DataType | undefined) => {
    if (type && !sameScalarType(scalarType(form.getValues("value")), type))
      form.setValue("value", defaultScalar(type), { shouldValidate: true });
  };
  return (
    <div className="space-y-4">
      <Field>
        <div className="flex items-center gap-3">
          <Switch
            id="write-event-device"
            checked={!deviceId}
            onCheckedChange={(checked) =>
              form.setValue(
                "device_id",
                checked ? null : (catalog.devices[0]?.id ?? null),
                { shouldValidate: true },
              )
            }
          />
          <FieldLabel htmlFor="write-event-device">
            {t("write.eventDevice")}
          </FieldLabel>
        </div>
      </Field>
      {!deviceId ? (
        <InputController
          control={form.control}
          name="attribute"
          label={t("write.attribute")}
          required
        />
      ) : (
        <AttributeSelect
          catalog={catalog}
          writable
          label={t("write.target")}
          value={{ device_id: deviceId, attribute }}
          onChange={(value) => {
            form.setValue("device_id", value.device_id, {
              shouldValidate: true,
            });
            form.setValue("attribute", value.attribute, {
              shouldValidate: true,
            });
            retype(attributeType(catalog, value));
          }}
        />
      )}
      <Controller
        control={form.control}
        name="value"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            {!dataType && (
              <FieldShell id={typeId} label={t("write.valueType")}>
                <Select
                  value={scalarType(field.value)}
                  onValueChange={(type) =>
                    field.onChange(defaultScalar(type as DataType))
                  }
                >
                  <SelectTrigger id={typeId} className="w-full sm:w-60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALUE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`write.types.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            )}
            <ScalarInput
              label={t("write.value")}
              value={field.value}
              dataType={dataType}
              onChange={field.onChange}
            />
            {fieldState.invalid && (
              <p role="alert" className="text-sm text-destructive">
                {t("tree.invalidCondition")}
              </p>
            )}
          </Field>
        )}
      />
      <p className="text-xs text-muted-foreground">{t("write.protected")}</p>
    </div>
  );
}

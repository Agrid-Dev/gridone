import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { InputController } from "@/components/forms/controllers/InputController";
import { ExpressionEditor } from "@/pages/devices/device/operating-rules/ConditionEditor";
import { AttributeSelect } from "@/pages/devices/device/operating-rules/AttributeSelect";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel } from "@/components/ui/field";
import type { CustomActionFormProps } from "../../presenters/types";
import { useAutomationCatalog } from "../../hooks/useAutomationCatalog";
import { useWriteAttributeForm } from "./useWriteAttributeForm";

export function WriteAttributeActionForm(props: CustomActionFormProps) {
  const { t } = useTranslation("automations");
  const { form, isLoading, isError } = useWriteAttributeForm(props);
  const catalog = useAutomationCatalog();
  const deviceId = form.watch("device_id");
  const attribute = form.watch("attribute");
  return (
    <div className="space-y-4">
      {(isLoading || isError) && (
        <p role="status">{t(isError ? "toasts.saveError" : "tree.loading")}</p>
      )}
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
          }}
        />
      )}
      <Controller
        control={form.control}
        name="value"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <ExpressionEditor
              label={t("write.value")}
              value={field.value}
              onChange={field.onChange}
              catalog={catalog}
              eventContext
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

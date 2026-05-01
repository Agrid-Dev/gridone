import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { type Trigger } from "@/api/automations";
import { type CustomTriggerFormProps } from "../presenters/types";

const formSchema = z.object({
  deviceId: z.string().min(1),
  attribute: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

const ChangeEventForm: FC<CustomTriggerFormProps> = ({
  type,
  initialValue,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation("common");

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      deviceId:
        typeof initialValue?.deviceId === "string" ? initialValue.deviceId : "",
      attribute:
        typeof initialValue?.attribute === "string"
          ? initialValue.attribute
          : "",
    },
  });

  const { field: deviceField } = useController({ control, name: "deviceId" });
  const { field: attrField } = useController({ control, name: "attribute" });

  const submit = (values: FormValues) => {
    // Spread initialValue so unknown trigger fields (e.g. `condition`) are
    // preserved across edits — the ConditionEditor lands in a follow-up.
    onSubmit({ ...(initialValue ?? {}), type, ...values } as Trigger);
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <DeviceAttributePicker
        deviceId={deviceField.value || undefined}
        attribute={attrField.value || undefined}
        onChange={({ deviceId, attribute }) => {
          deviceField.onChange(deviceId);
          attrField.onChange(attribute);
        }}
        required
      />

      <div className="flex align-middle justify-end gap-2 mt-8">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!formState.isValid || !formState.isDirty}
        >
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
};

export default ChangeEventForm;
export { ChangeEventForm };

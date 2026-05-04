import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { type CustomTriggerFormProps } from "../../presenters/types";
import { ConditionEditor } from "./ConditionEditor";
import { useChangeEventForm } from "./useChangeEventForm";

const ChangeEventForm: FC<CustomTriggerFormProps> = ({
  type,
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
}) => {
  const { t } = useTranslation("common");
  const {
    control,
    formState,
    submit,
    deviceId,
    attribute,
    dataType,
    handlePickerChange,
  } = useChangeEventForm({ type, initialValue, onSubmit });

  return (
    <form id={formId} onSubmit={submit} className="space-y-6">
      <DeviceAttributePicker
        deviceId={deviceId || undefined}
        attribute={attribute || undefined}
        onChange={handlePickerChange}
        required
      />

      <Controller
        control={control}
        name="condition"
        render={({ field }) => (
          <ConditionEditor
            value={field.value}
            onChange={field.onChange}
            dataType={dataType}
          />
        )}
      />

      {!hideActions && (
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
      )}
    </form>
  );
};

export default ChangeEventForm;
export { ChangeEventForm };

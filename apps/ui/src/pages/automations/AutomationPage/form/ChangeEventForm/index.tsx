import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui";
import { DeviceAttributePicker } from "@/components/forms/resourcePickers/DeviceAttributePicker";
import { type CustomTriggerFormProps } from "../../presenters/types";
import { useDraftReport } from "../useDraftReport";
import { ConditionEditor } from "./ConditionEditor";
import { useChangeEventForm } from "./useChangeEventForm";

const ChangeEventForm: FC<CustomTriggerFormProps> = ({
  type,
  initialValue,
  onSubmit,
  onChange,
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
    valueOptions,
    deviceType,
    condition,
    handlePickerChange,
  } = useChangeEventForm({ type, initialValue, onSubmit });

  useDraftReport(
    formState.isValid && condition
      ? {
          provider_id: type,
          params: { device_id: deviceId, attribute, condition },
        }
      : null,
    onChange,
  );

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
            valueOptions={valueOptions}
            attributeName={attribute || undefined}
            deviceType={deviceType}
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

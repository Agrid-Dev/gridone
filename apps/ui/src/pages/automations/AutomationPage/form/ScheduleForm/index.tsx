import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import type { CustomTriggerFormProps } from "../../presenters/types";
import { buildCronExpression, isScheduleComplete } from "./cronSchedule";
import { CronPicker } from "./CronPicker";
import { useScheduleForm } from "./useScheduleForm";

export const ScheduleForm: FC<CustomTriggerFormProps> = ({
  type,
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
}) => {
  const { t } = useTranslation("common");
  const { control, formState, submit, watch } = useScheduleForm({
    type,
    initialValue,
    onSubmit,
  });
  const values = watch();
  const isComplete = isScheduleComplete(values);

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <CronPicker
        control={control}
        frequency={values.frequency}
        cron={buildCronExpression(values)}
      />

      {!hideActions && (
        <div className="mt-8 flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!isComplete || !formState.isDirty}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </form>
  );
};

export default ScheduleForm;

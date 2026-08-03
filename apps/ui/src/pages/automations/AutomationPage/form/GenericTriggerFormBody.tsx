import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { SchemaFields } from "@/components/forms/schema-form";
import type { Trigger } from "@gridone/sdk";
import {
  useGenericTriggerForm,
  type TriggerSchema,
} from "./useGenericTriggerForm";

interface GenericTriggerFormBodyProps {
  type: string;
  schema: TriggerSchema;
  initialValue?: Trigger;
  onSubmit: (trigger: Trigger) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
}

/** Schema-driven fallback for trigger providers without a registered custom
 *  form (providers with one — schedule, change_event — never reach it). */
const GenericTriggerFormBody: FC<GenericTriggerFormBodyProps> = ({
  type,
  schema,
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
}) => {
  const { t } = useTranslation(["common", "automations"]);

  const { form, fields } = useGenericTriggerForm(schema, initialValue?.params);

  const handleFormSubmit = (values: Record<string, unknown>) => {
    onSubmit({ provider_id: type, params: values });
  };

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(handleFormSubmit)}
      className="space-y-4"
    >
      <div className="grid gap-4">
        <SchemaFields fields={fields} control={form.control} />
      </div>

      {!hideActions && (
        <div className="flex align-middle justify-end gap-2 mt-8">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common:common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!form.formState.isValid || !form.formState.isDirty}
          >
            {t("common:common.save")}
          </Button>
        </div>
      )}
    </form>
  );
};

export default GenericTriggerFormBody;

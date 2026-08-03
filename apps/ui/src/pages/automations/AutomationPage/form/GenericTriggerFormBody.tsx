import { FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  applyServerFieldErrors,
  SchemaFields,
  ServerErrorAlert,
} from "@/components/forms/schema-form";
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
  serverError?: unknown;
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
  serverError,
}) => {
  const { t } = useTranslation(["common", "automations"]);
  const saveErrorMessage = t("automations:toasts.saveError");

  const { form, fields } = useGenericTriggerForm(schema, initialValue?.params);

  useEffect(() => {
    if (serverError === undefined) return;
    applyServerFieldErrors(form, serverError, {
      // Unsupported fields render no FieldError — leave them unregistered so
      // their errors reach the root banner instead of vanishing.
      fieldNames: fields
        .filter((field) => field.kind !== "unsupported")
        .map((field) => field.name),
      fallbackMessage: saveErrorMessage,
      prefixes: ["trigger", "params"],
      unionTag: type,
    });
  }, [serverError, form, fields, saveErrorMessage, type]);

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

      <ServerErrorAlert message={form.formState.errors.root?.server?.message} />

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

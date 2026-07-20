import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { InputController } from "@/components/forms/controllers/InputController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { Button } from "@/components/ui/button";

/** Values handed to the caller's submit handler (empty description → omitted). */
export interface DashboardFormValues {
  name: string;
  description?: string;
}

interface DashboardFormProps {
  defaultValues?: { name?: string; description?: string };
  submitLabel: string;
  onSubmit: (values: DashboardFormValues) => Promise<void>;
  onCancel: () => void;
  /** Distinct id per instance so multiple forms (create page, rename dialog)
   *  don't collide on field ids. */
  formId?: string;
}

/** Shared create/rename form: a required name and an optional description,
 *  validated with zod. The caller owns the mutation via `onSubmit`. */
export function DashboardForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
  formId = "dashboard-form",
}: DashboardFormProps) {
  const { t } = useTranslation(["dashboards", "common"]);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("validation.nameRequired")),
        description: z.string(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      description: values.description.trim() || undefined,
    });
  });

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <InputController
        name="name"
        control={form.control}
        label={t("fields.name")}
        required
      />
      <TextareaController
        name="description"
        control={form.control}
        label={t("fields.description")}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel}>
          {t("common:common.cancel")}
        </Button>
        <Button
          type="submit"
          form={formId}
          disabled={!form.formState.isValid || form.formState.isSubmitting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

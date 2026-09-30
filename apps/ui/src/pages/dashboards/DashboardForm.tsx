import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { DashboardIcon } from "@gridone/sdk";
import { IconGridController } from "@/components/forms/controllers/IconGridController";
import { InputController } from "@/components/forms/controllers/InputController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ICON_KEYS, DASHBOARD_ICONS } from "@/lib/dashboardIcons";

/** Values handed to the caller's submit handler. `description` is the trimmed
 *  string (possibly empty); the caller decides whether an empty string means
 *  "omit" (create) or "clear" (update). */
export interface DashboardFormValues {
  name: string;
  description: string;
  icon: DashboardIcon | null;
}

interface DashboardFormProps {
  defaultValues?: {
    name?: string;
    description?: string;
    icon?: DashboardIcon | null;
  };
  submitLabel: string;
  onSubmit: (values: DashboardFormValues) => Promise<void>;
  onCancel: () => void;
  /** Distinct id per instance so multiple forms (create page, rename dialog)
   *  don't collide on field ids. */
  formId?: string;
}

/** Shared create/rename form: a required name, an optional description and
 *  an optional icon, validated with zod. The caller owns the mutation via
 *  `onSubmit`. */
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
        icon: z.enum(DASHBOARD_ICON_KEYS).nullable(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? null,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      icon: values.icon,
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
      <IconGridController
        name="icon"
        control={form.control}
        icons={DASHBOARD_ICONS}
        label={t("fields.icon")}
        noneLabel={t("icon.none")}
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

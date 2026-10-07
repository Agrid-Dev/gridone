import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { DashboardIcon, DashboardType } from "@gridone/sdk";
import { IconGridController } from "@/components/forms/controllers/IconGridController";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ICON_KEYS, DASHBOARD_ICONS } from "@/lib/dashboardIcons";
import { DASHBOARD_TYPE_KEYS, DASHBOARD_TYPES } from "./dashboardTypes";

/** Values handed to the caller's submit handler. `description` is the trimmed
 *  string (possibly empty); the caller decides whether an empty string means
 *  "omit" (create) or "clear" (update). `type` is only meaningful on create:
 *  it is fixed afterwards, and a locked form hands back the one it was given. */
export interface DashboardFormValues {
  name: string;
  type: DashboardType;
  description: string;
  icon: DashboardIcon | null;
}

interface DashboardFormProps {
  defaultValues?: {
    name?: string;
    type?: DashboardType;
    description?: string;
    icon?: DashboardIcon | null;
  };
  /** Shows the type read-only: an existing dashboard keeps its type, since
   *  changing it would strand the widgets already placed. */
  lockType?: boolean;
  submitLabel: string;
  onSubmit: (values: DashboardFormValues) => Promise<void>;
  onCancel: () => void;
  /** Distinct id per instance so multiple forms (create page, rename dialog)
   *  don't collide on field ids. */
  formId?: string;
}

/** Shared create/rename form: a required name, the type (picked once), an
 *  optional description and an optional icon, validated with zod. The caller
 *  owns the mutation via `onSubmit`. */
export function DashboardForm({
  defaultValues,
  lockType = false,
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
        type: z.enum(DASHBOARD_TYPE_KEYS),
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
      type: defaultValues?.type ?? "live",
      description: defaultValues?.description ?? "",
      icon: defaultValues?.icon ?? null,
    },
  });
  const type = useWatch({ control: form.control, name: "type" });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      type: values.type,
      description: values.description.trim(),
      icon: values.icon,
    });
  });

  const typeOptions = DASHBOARD_TYPE_KEYS.map((key) => {
    const { Icon } = DASHBOARD_TYPES[key];
    return {
      value: key,
      label: (
        <span className="flex items-center gap-2">
          <Icon aria-hidden className="h-4 w-4 text-muted-foreground" />
          {t(`types.${key}.label`)}
        </span>
      ),
    };
  });

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <InputController
        name="name"
        control={form.control}
        label={t("fields.name")}
        required
      />
      {lockType ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("fields.type")}</span>
          <span
            data-testid="dashboard-type-locked"
            className="w-fit rounded-md border border-border bg-muted px-2.5 py-1 text-sm font-medium"
          >
            {t(`types.${type}.label`)}
          </span>
          <p className="text-xs text-muted-foreground">{t("types.locked")}</p>
        </div>
      ) : (
        <SelectController
          name="type"
          control={form.control}
          label={t("fields.type")}
          description={t(`types.${type}.description`)}
          options={typeOptions}
          required
        />
      )}
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

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { DashboardIcon } from "@gridone/sdk";
import { IconGridController } from "@/components/forms/controllers/IconGridController";
import { InputController } from "@/components/forms/controllers/InputController";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ICON_KEYS, DASHBOARD_ICONS } from "@/lib/dashboardIcons";

export interface NodeFormValues {
  label: string;
  icon: DashboardIcon | null;
}

interface NodeFormProps {
  /** A group carries an icon (it is drawn like a dashboard entry); a section
   *  is a heading, label only. */
  kind: "section" | "group";
  defaultValues?: Partial<NodeFormValues>;
  submitLabel: string;
  onSubmit: (values: NodeFormValues) => Promise<void>;
  onCancel: () => void;
}

/** The label (and, for a group, the icon) of a structure node. */
export function NodeForm({
  kind,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: NodeFormProps) {
  const { t } = useTranslation(["dashboards", "common"]);
  const formId = `structure-${kind}-form`;

  const schema = useMemo(
    () =>
      z.object({
        label: z.string().trim().min(1, t("validation.labelRequired")),
        icon: z.enum(DASHBOARD_ICON_KEYS).nullable(),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      label: defaultValues?.label ?? "",
      icon: defaultValues?.icon ?? null,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      label: values.label.trim(),
      icon: kind === "group" ? values.icon : null,
    });
  });

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <InputController
        name="label"
        control={form.control}
        label={t("structure.fields.label")}
        required
      />
      {kind === "group" && (
        <IconGridController
          name="icon"
          control={form.control}
          icons={DASHBOARD_ICONS}
          label={t("fields.icon")}
          noneLabel={t("icon.none")}
        />
      )}
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

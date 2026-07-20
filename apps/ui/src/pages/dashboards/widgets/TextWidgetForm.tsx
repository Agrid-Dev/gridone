import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { InputController } from "@/components/forms/controllers/InputController";
import { Button } from "@/components/ui/button";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = "#3b82f6";

export interface TextWidgetFormValues {
  text: string;
  color: string;
}

interface TextWidgetFormProps {
  defaultValues?: Partial<TextWidgetFormValues>;
  submitLabel: string;
  onSubmit: (values: TextWidgetFormValues) => Promise<void>;
  onCancel: () => void;
}

/** Config form for the `text` widget: the text and its color. Reused for both
 *  add and edit. The native color input always yields a valid `#rrggbb`. */
export function TextWidgetForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: TextWidgetFormProps) {
  const { t } = useTranslation(["dashboards", "common"]);

  const schema = useMemo(
    () =>
      z.object({
        text: z.string().trim().min(1, t("widgets.validation.textRequired")),
        color: z
          .string()
          .regex(HEX_COLOR, t("widgets.validation.colorInvalid")),
      }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      text: defaultValues?.text ?? "",
      color: defaultValues?.color ?? DEFAULT_COLOR,
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({ text: values.text.trim(), color: values.color });
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <InputController
        name="text"
        control={form.control}
        label={t("widgets.fields.text")}
        required
      />
      <Controller
        name="color"
        control={form.control}
        render={({ field }) => (
          <div className="space-y-1.5">
            <label htmlFor="widget-color" className="text-sm font-medium">
              {t("widgets.fields.color")}
            </label>
            <div className="flex items-center gap-3">
              <input
                id="widget-color"
                type="color"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <span className="font-mono text-sm text-muted-foreground">
                {field.value}
              </span>
            </div>
          </div>
        )}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel}>
          {t("common:common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!form.formState.isValid || form.formState.isSubmitting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

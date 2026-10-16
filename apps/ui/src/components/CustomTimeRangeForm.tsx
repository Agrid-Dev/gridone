import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "@/components/ui";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { useCustomTimeRangeForm } from "@/hooks/useCustomTimeRangeForm";
import { localDateTime } from "@/lib/customTimeRange";
import type { TimeRange } from "@/lib/timeRange";

export function CustomTimeRangeForm({
  timeRange,
  onApply,
}: {
  timeRange: TimeRange;
  onApply: (range: TimeRange) => void;
}) {
  const { t } = useTranslation("common");
  const { form, submit } = useCustomTimeRangeForm(timeRange, onApply);
  const id = useId();
  return (
    <form noValidate onSubmit={submit} className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        {timeRange.kind === "custom" && (
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-foreground" />
        )}
        {t("timeRange.rangeCustom")}
      </p>
      {(["start", "end"] as const).map((name) => {
        const error = form.formState.errors[name];
        return (
          <Field key={name} data-invalid={!!error} className="gap-1.5">
            <FieldLabel htmlFor={`${id}-${name}`}>
              {t(`timeRange.${name}`)}
            </FieldLabel>
            <Input
              id={`${id}-${name}`}
              type="datetime-local"
              step="any"
              max={localDateTime(new Date().toISOString())}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-${name}-error` : undefined}
              {...form.register(name)}
            />
            {error && (
              <FieldError id={`${id}-${name}-error`}>
                {t(
                  `timeRange.errors.${error.message}` as "timeRange.errors.invalid",
                )}
              </FieldError>
            )}
          </Field>
        );
      })}
      <Button variant="secondary" size="sm" className="w-full" type="submit">
        {t("timeRange.rangeApply")}
      </Button>
    </form>
  );
}

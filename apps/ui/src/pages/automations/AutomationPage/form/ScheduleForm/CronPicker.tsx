import { Controller, type Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CalendarClock, Info } from "lucide-react";
import { Button } from "@/components/ui";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { describeCronExpression } from "../../presenters/cronDescription";
import type { ScheduleFormValues, ScheduleFrequency } from "./cronSchedule";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const FREQUENCIES = [
  "minutes",
  "hours",
  "daily",
  "weekly",
  "monthly",
  "custom",
] as const;

type CronPickerProps = {
  control: Control<ScheduleFormValues>;
  frequency: ScheduleFrequency;
  cron: string;
};

export function CronPicker({ control, frequency, cron }: CronPickerProps) {
  const { t, i18n } = useTranslation("automations");
  const language = i18n?.resolvedLanguage ?? i18n?.language;
  const description =
    describeCronExpression(cron, language) ??
    t("triggers.schedule.descriptionUnavailable");
  const frequencyOptions = FREQUENCIES.map((value) => ({
    value,
    label: t(`triggers.schedule.frequencies.${value}`),
  }));

  return (
    <div className="space-y-5 rounded-lg border bg-muted/20 p-4">
      <SelectController
        name="frequency"
        control={control}
        label={t("triggers.schedule.frequency")}
        options={frequencyOptions}
        triggerProps={{ className: "w-full sm:w-72" }}
      />

      {frequency === "minutes" && (
        <InputController
          name="minuteInterval"
          control={control}
          type="number"
          label={t("triggers.schedule.minuteInterval")}
          inputProps={{ min: 1, max: 59, className: "w-full sm:w-40" }}
          required
        />
      )}

      {frequency === "hours" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <InputController
            name="hourInterval"
            control={control}
            type="number"
            label={t("triggers.schedule.hourInterval")}
            inputProps={{ min: 1, max: 23 }}
            required
          />
          <InputController
            name="minute"
            control={control}
            type="number"
            label={t("triggers.schedule.minute")}
            inputProps={{ min: 0, max: 59 }}
            required
          />
        </div>
      )}

      {(frequency === "daily" ||
        frequency === "weekly" ||
        frequency === "monthly") && (
        <InputController
          name="time"
          control={control}
          type="time"
          label={t("triggers.schedule.time")}
          inputProps={{ className: "w-full sm:w-48" }}
          required
        />
      )}

      {frequency === "weekly" && (
        <Controller
          name="weekdays"
          control={control}
          render={({ field, fieldState }) => (
            <FieldShell
              id="schedule-weekdays"
              label={t("triggers.schedule.weekdays.label")}
              invalid={fieldState.invalid}
              error={fieldState.error}
              required
            >
              <div
                id="schedule-weekdays"
                className="flex flex-wrap gap-2"
                role="group"
                aria-label={t("triggers.schedule.weekdays.label")}
              >
                {WEEKDAYS.map((weekday) => {
                  const selected = field.value.includes(weekday);
                  return (
                    <Button
                      key={weekday}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      className="h-10 min-w-10 px-2"
                      aria-pressed={selected}
                      onClick={() =>
                        field.onChange(
                          selected
                            ? field.value.filter((value) => value !== weekday)
                            : [...field.value, weekday],
                        )
                      }
                    >
                      {t(`triggers.schedule.weekdays.short.${weekday}`)}
                    </Button>
                  );
                })}
              </div>
            </FieldShell>
          )}
        />
      )}

      {frequency === "monthly" && (
        <InputController
          name="monthDay"
          control={control}
          type="number"
          label={t("triggers.schedule.monthDay")}
          inputProps={{ min: 1, max: 31, className: "w-full sm:w-40" }}
          required
        />
      )}

      {frequency === "custom" && (
        <InputController
          name="customCron"
          control={control}
          label={t("triggers.cron")}
          description={t("triggers.schedule.customHelp")}
          inputProps={{
            placeholder: "0 9 * * *",
            spellCheck: false,
            autoCapitalize: "none",
          }}
          required
        />
      )}

      <div
        className="flex gap-3 rounded-md border bg-background p-3"
        aria-live="polite"
      >
        <CalendarClock
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("triggers.schedule.preview")}
          </p>
          <p className="text-sm font-medium">{description}</p>
        </div>
      </div>

      <div className="flex gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>{t("triggers.schedule.utcNotice")}</p>
      </div>
    </div>
  );
}

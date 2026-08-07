import { Controller, type Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CalendarClock, Info } from "lucide-react";
import { Button } from "@/components/ui";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { cn } from "@/lib/utils";
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

/** Pin the label column of every horizontal field in the panel so the controls
 *  line up, instead of each label stretching to fill its row (what `Field`
 *  does by default in horizontal orientation). */
const LABEL_COLUMN =
  "sm:[&_[data-orientation=horizontal]>[data-slot=field-label]]:w-28 sm:[&_[data-orientation=horizontal]>[data-slot=field-label]]:flex-none";

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
    <div
      className={cn(
        "space-y-5 rounded-xl border border-border/70 bg-muted/30 p-5 sm:p-6",
        LABEL_COLUMN,
      )}
    >
      <SelectController
        name="frequency"
        control={control}
        label={t("triggers.schedule.frequency")}
        options={frequencyOptions}
        orientation="horizontal"
        triggerProps={{ className: "h-11 w-full bg-background sm:w-72" }}
      />

      {frequency === "minutes" && (
        <InputController
          name="minuteInterval"
          control={control}
          type="number"
          label={t("triggers.schedule.minuteInterval")}
          orientation="horizontal"
          inputProps={{
            min: 1,
            max: 59,
            className: "h-11 w-full bg-background sm:w-40",
          }}
          required
        />
      )}

      {frequency === "hours" && (
        <>
          <InputController
            name="hourInterval"
            control={control}
            type="number"
            label={t("triggers.schedule.hourInterval")}
            orientation="horizontal"
            inputProps={{
              min: 1,
              max: 23,
              className: "h-11 w-full bg-background sm:w-40",
            }}
            required
          />
          <InputController
            name="minute"
            control={control}
            type="number"
            label={t("triggers.schedule.minute")}
            orientation="horizontal"
            inputProps={{
              min: 0,
              max: 59,
              className: "h-11 w-full bg-background sm:w-40",
            }}
            required
          />
        </>
      )}

      {(frequency === "daily" ||
        frequency === "weekly" ||
        frequency === "monthly") && (
        <InputController
          name="time"
          control={control}
          type="time"
          label={t("triggers.schedule.time")}
          orientation="horizontal"
          inputProps={{ className: "h-11 w-full bg-background sm:w-40" }}
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
              orientation="horizontal"
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
                      className={cn(
                        "h-11 min-w-14 rounded-full px-4 font-medium",
                        !selected && "bg-background",
                      )}
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
          orientation="horizontal"
          inputProps={{
            min: 1,
            max: 31,
            className: "h-11 w-full bg-background sm:w-40",
          }}
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
            className: "h-11 bg-background",
          }}
          required
        />
      )}

      <div className="space-y-3 border-t border-border/60 pt-4">
        <div className="flex gap-3" aria-live="polite">
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

        <div className="flex gap-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t("triggers.schedule.utcNotice")}</p>
        </div>
      </div>
    </div>
  );
}

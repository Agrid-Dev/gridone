import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import * as z from "zod";
import type { CustomTriggerFormProps } from "../../presenters/types";
import {
  buildCronExpression,
  parseCronExpression,
  SCHEDULE_FREQUENCIES,
  type ScheduleFormValues,
} from "./cronSchedule";

const minuteIntervalSchema = z.number().int().min(1).max(59);
const hourIntervalSchema = z.number().int().min(1).max(23);
const minuteSchema = z.number().int().min(0).max(59);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weekdaysSchema = z.array(z.number().int().min(0).max(6)).min(1);
const monthDaySchema = z.number().int().min(1).max(31);
const customCronSchema = z.string().trim().min(1);

const scheduleFormSchema = z
  .object({
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    minuteInterval: z.unknown(),
    hourInterval: z.unknown(),
    minute: z.unknown(),
    time: z.unknown(),
    weekdays: z.unknown(),
    monthDay: z.unknown(),
    customCron: z.string(),
  })
  .superRefine((values, context) => {
    const validate = (
      schema: z.ZodType,
      value: unknown,
      field: keyof ScheduleFormValues,
    ) => {
      const result = schema.safeParse(value);
      if (result.success) return;

      context.addIssue({
        code: "custom",
        path: [field],
        message: result.error.issues[0]?.message ?? "Invalid value",
      });
    };

    switch (values.frequency) {
      case "minutes":
        validate(minuteIntervalSchema, values.minuteInterval, "minuteInterval");
        break;
      case "hours":
        validate(hourIntervalSchema, values.hourInterval, "hourInterval");
        validate(minuteSchema, values.minute, "minute");
        break;
      case "daily":
        validate(timeSchema, values.time, "time");
        break;
      case "weekly":
        validate(timeSchema, values.time, "time");
        validate(weekdaysSchema, values.weekdays, "weekdays");
        break;
      case "monthly":
        validate(timeSchema, values.time, "time");
        validate(monthDaySchema, values.monthDay, "monthDay");
        break;
      case "custom":
        validate(customCronSchema, values.customCron, "customCron");
        break;
    }
  });

type UseScheduleFormParams = Pick<
  CustomTriggerFormProps,
  "type" | "initialValue" | "onSubmit"
>;

export function useScheduleForm({
  type,
  initialValue,
  onSubmit,
}: UseScheduleFormParams) {
  const cron =
    typeof initialValue?.params?.cron === "string"
      ? initialValue.params.cron
      : undefined;

  const resolver = zodResolver(
    scheduleFormSchema,
  ) as Resolver<ScheduleFormValues>;
  const form = useForm<ScheduleFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: parseCronExpression(cron),
  });

  const submit = form.handleSubmit((values) => {
    onSubmit({
      provider_id: type,
      params: { cron: buildCronExpression(values) },
    });
  });

  return { ...form, submit };
}

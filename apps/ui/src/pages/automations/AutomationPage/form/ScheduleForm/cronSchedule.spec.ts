import { describe, expect, it } from "vitest";
import {
  buildCronExpression,
  isScheduleComplete,
  parseCronExpression,
  type ScheduleFormValues,
} from "./cronSchedule";

describe("parseCronExpression", () => {
  it.each([
    ["* * * * *", "minutes", { minuteInterval: 1 }],
    ["*/15 * * * *", "minutes", { minuteInterval: 15 }],
    ["10 * * * *", "hours", { hourInterval: 1, minute: 10 }],
    ["5 */3 * * *", "hours", { hourInterval: 3, minute: 5 }],
    ["30 8 * * *", "daily", { time: "08:30" }],
    ["30 8 * * 1-5", "weekly", { time: "08:30", weekdays: [1, 2, 3, 4, 5] }],
    ["0 7 * * SUN,WED,SAT", "weekly", { time: "07:00", weekdays: [0, 3, 6] }],
    ["0 9 15 * *", "monthly", { time: "09:00", monthDay: 15 }],
  ])("maps %s to the picker", (cron, frequency, expected) => {
    expect(parseCronExpression(cron)).toMatchObject({
      frequency,
      ...expected,
    });
  });

  it("uses a friendly default for a new schedule", () => {
    expect(parseCronExpression()).toMatchObject({
      frequency: "daily",
      time: "09:00",
    });
  });

  it.each(["0 9 L * *", "0 9 * JAN *", "0 9 * * 5-0", "invalid"])(
    "preserves unsupported expression %s as a custom schedule",
    (cron) => {
      const values = parseCronExpression(cron);

      expect(values).toMatchObject({ frequency: "custom", customCron: cron });
      expect(buildCronExpression(values)).toBe(cron);
    },
  );
});

describe("buildCronExpression", () => {
  const base: ScheduleFormValues = {
    frequency: "daily",
    minuteInterval: 5,
    hourInterval: 1,
    minute: 0,
    time: "09:00",
    weekdays: [1],
    monthDay: 1,
    customCron: "",
  };

  it.each([
    [{ ...base, frequency: "minutes", minuteInterval: 1 }, "* * * * *"],
    [{ ...base, frequency: "minutes", minuteInterval: 20 }, "*/20 * * * *"],
    [
      { ...base, frequency: "hours", hourInterval: 1, minute: 15 },
      "15 * * * *",
    ],
    [
      { ...base, frequency: "hours", hourInterval: 6, minute: 15 },
      "15 */6 * * *",
    ],
    [{ ...base, frequency: "daily", time: "17:45" }, "45 17 * * *"],
    [
      {
        ...base,
        frequency: "weekly",
        time: "06:30",
        weekdays: [5, 1, 5, 3],
      },
      "30 6 * * 1,3,5",
    ],
    [
      { ...base, frequency: "monthly", time: "12:05", monthDay: 28 },
      "5 12 28 * *",
    ],
  ] satisfies Array<[ScheduleFormValues, string]>)(
    "builds $frequency schedules",
    (values, expected) => {
      expect(buildCronExpression(values)).toBe(expected);
    },
  );
});

describe("isScheduleComplete", () => {
  const base: ScheduleFormValues = {
    frequency: "daily",
    minuteInterval: 5,
    hourInterval: 1,
    minute: 0,
    time: "09:00",
    weekdays: [1],
    monthDay: 1,
    customCron: "",
  };

  it.each([
    { ...base, frequency: "minutes" as const },
    { ...base, frequency: "hours" as const },
    { ...base, frequency: "daily" as const },
    { ...base, frequency: "weekly" as const },
    { ...base, frequency: "monthly" as const },
    { ...base, frequency: "custom" as const, customCron: "0 9 L * *" },
  ])("accepts a complete $frequency schedule", (values) => {
    expect(isScheduleComplete(values)).toBe(true);
  });

  it.each([
    { ...base, frequency: "minutes" as const, minuteInterval: 0 },
    { ...base, frequency: "hours" as const, hourInterval: 24 },
    { ...base, frequency: "hours" as const, minute: 60 },
    { ...base, frequency: "daily" as const, time: "25:00" },
    { ...base, frequency: "weekly" as const, weekdays: [] },
    { ...base, frequency: "monthly" as const, monthDay: 32 },
    { ...base, frequency: "custom" as const, customCron: " " },
  ])("rejects an incomplete $frequency schedule", (values) => {
    expect(isScheduleComplete(values)).toBe(false);
  });
});

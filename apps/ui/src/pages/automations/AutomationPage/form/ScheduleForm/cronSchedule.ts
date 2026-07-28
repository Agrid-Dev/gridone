export const SCHEDULE_FREQUENCIES = [
  "minutes",
  "hours",
  "daily",
  "weekly",
  "monthly",
  "custom",
] as const;

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export type ScheduleFormValues = {
  frequency: ScheduleFrequency;
  minuteInterval: number;
  hourInterval: number;
  minute: number;
  time: string;
  weekdays: number[];
  monthDay: number;
  customCron: string;
};

const DEFAULT_SCHEDULE: ScheduleFormValues = {
  frequency: "daily",
  minuteInterval: 5,
  hourInterval: 1,
  minute: 0,
  time: "09:00",
  weekdays: [1],
  monthDay: 1,
  customCron: "",
};

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Convert a five-field cron expression into the small set of schedules exposed
 * by the picker. For example, `0 9 * * 1-5` becomes a weekly schedule at
 * 09:00 on Monday through Friday. Advanced expressions are kept verbatim as a
 * custom schedule so editing an existing automation can never corrupt it.
 */
export function parseCronExpression(cron?: string): ScheduleFormValues {
  if (!cron) return { ...DEFAULT_SCHEDULE };

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return customSchedule(cron);

  const [minutePart, hourPart, monthDayPart, monthPart, weekdayPart] =
    parts as [string, string, string, string, string];

  if (
    hourPart === "*" &&
    monthDayPart === "*" &&
    monthPart === "*" &&
    weekdayPart === "*"
  ) {
    if (minutePart === "*") {
      return {
        ...DEFAULT_SCHEDULE,
        frequency: "minutes",
        minuteInterval: 1,
      };
    }

    const minuteInterval = parseStep(minutePart, 59);
    if (minuteInterval !== null) {
      return {
        ...DEFAULT_SCHEDULE,
        frequency: "minutes",
        minuteInterval,
      };
    }

    const minute = parseInteger(minutePart, 0, 59);
    if (minute !== null) {
      return { ...DEFAULT_SCHEDULE, frequency: "hours", minute };
    }
  }

  const minute = parseInteger(minutePart, 0, 59);
  const hour = parseInteger(hourPart, 0, 23);
  const hourInterval = parseStep(hourPart, 23);

  if (
    minute !== null &&
    hourInterval !== null &&
    monthDayPart === "*" &&
    monthPart === "*" &&
    weekdayPart === "*"
  ) {
    return {
      ...DEFAULT_SCHEDULE,
      frequency: "hours",
      hourInterval,
      minute,
    };
  }

  if (minute === null || hour === null || monthPart !== "*") {
    return customSchedule(cron);
  }

  const time = toTime(hour, minute);

  if (monthDayPart === "*" && weekdayPart === "*") {
    return { ...DEFAULT_SCHEDULE, frequency: "daily", time };
  }

  if (monthDayPart === "*") {
    const weekdays = parseWeekdays(weekdayPart);
    if (weekdays) {
      return {
        ...DEFAULT_SCHEDULE,
        frequency: "weekly",
        time,
        weekdays,
      };
    }
  }

  if (weekdayPart === "*") {
    const monthDay = parseInteger(monthDayPart, 1, 31);
    if (monthDay !== null) {
      return {
        ...DEFAULT_SCHEDULE,
        frequency: "monthly",
        time,
        monthDay,
      };
    }
  }

  return customSchedule(cron);
}

export function buildCronExpression(values: ScheduleFormValues): string {
  switch (values.frequency) {
    case "minutes":
      return values.minuteInterval === 1
        ? "* * * * *"
        : `*/${values.minuteInterval} * * * *`;
    case "hours":
      return values.hourInterval === 1
        ? `${values.minute} * * * *`
        : `${values.minute} */${values.hourInterval} * * *`;
    case "daily": {
      const { hour, minute } = fromTime(values.time);
      return `${minute} ${hour} * * *`;
    }
    case "weekly": {
      const { hour, minute } = fromTime(values.time);
      return `${minute} ${hour} * * ${sortWeekdays(values.weekdays).join(",")}`;
    }
    case "monthly": {
      const { hour, minute } = fromTime(values.time);
      return `${minute} ${hour} ${values.monthDay} * *`;
    }
    case "custom":
      return values.customCron;
  }
}

/**
 * Check only the controls relevant to the selected picker mode. This keeps a
 * half-edited field from a previous mode from disabling an otherwise complete
 * schedule after the user changes frequency.
 */
export function isScheduleComplete(values: ScheduleFormValues): boolean {
  switch (values.frequency) {
    case "minutes":
      return isIntegerInRange(values.minuteInterval, 1, 59);
    case "hours":
      return (
        isIntegerInRange(values.hourInterval, 1, 23) &&
        isIntegerInRange(values.minute, 0, 59)
      );
    case "daily":
      return isTime(values.time);
    case "weekly":
      return isTime(values.time) && values.weekdays.length > 0;
    case "monthly":
      return isTime(values.time) && isIntegerInRange(values.monthDay, 1, 31);
    case "custom":
      return values.customCron.trim().length > 0;
  }
}

function customSchedule(cron: string): ScheduleFormValues {
  return { ...DEFAULT_SCHEDULE, frequency: "custom", customCron: cron };
}

/**
 * Parse the cron step form `star-slash-N` (for example `star-slash-15`) while
 * rejecting zero and values beyond the field's range.
 */
function parseStep(value: string, maximum: number): number | null {
  const match = value.match(/^\*\/(\d+)$/);
  if (!match) return null;
  return parseInteger(match[1], 1, maximum);
}

/** Parse an unsigned integer string such as `15` within a cron field range. */
function parseInteger(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

/** Return whether a value is a 24-hour `HH:MM` time such as `09:30`. */
function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Parse comma-separated weekday values and ascending ranges such as `1-5` or
 * `MON-FRI`. Cron's alternate Sunday value (`7`) is normalized to `0`.
 */
function parseWeekdays(value: string): number[] | null {
  const result = new Set<number>();

  for (const segment of value.split(",")) {
    const [startValue, endValue, ...extra] = segment.split("-");
    if (extra.length > 0 || !startValue) return null;

    const start = parseWeekday(startValue);
    const end = endValue ? parseWeekday(endValue) : start;
    if (start === null || end === null || start > end) return null;

    for (let weekday = start; weekday <= end; weekday += 1) {
      result.add(weekday === 7 ? 0 : weekday);
    }
  }

  return result.size > 0 ? sortWeekdays([...result]) : null;
}

function parseWeekday(value: string): number | null {
  const named = WEEKDAY_NAMES[value.toLowerCase()];
  if (named !== undefined) return named;
  return parseInteger(value, 0, 7);
}

function sortWeekdays(weekdays: number[]): number[] {
  return [...new Set(weekdays)].sort((left, right) => left - right);
}

function toTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Split the picker's validated 24-hour value (for example `09:30`) into the
 * numeric cron hour and minute fields.
 */
function fromTime(value: string): { hour: number; minute: number } {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return { hour: 9, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

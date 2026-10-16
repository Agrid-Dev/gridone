import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { formatCompactDuration } from "./compactDuration";

const LABELS: Record<string, string> = {
  "common.compactDuration.lessThanAMinute": "< 1 min",
  "common.compactDuration.minutes": "{{value}} min",
  "common.compactDuration.hours": "{{value}} h",
  "common.compactDuration.hoursMinutes": "{{hours}} h {{minutes}}",
  "common.compactDuration.days": "{{value}} j",
  "common.compactDuration.daysHours": "{{days}} j {{hours}} h",
};

const t = ((key: string, options: Record<string, unknown>) =>
  LABELS[key].replace(/{{(\w+)}}/g, (_, name) =>
    String(options[name]),
  )) as unknown as TFunction<"common">;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatCompactDuration", () => {
  it.each([
    [30_000, "< 1 min"],
    [46 * MINUTE, "46 min"],
    // Floored: a duration never reads longer than it lasted.
    [59 * MINUTE + 59_000, "59 min"],
    [HOUR, "1 h"],
    [HOUR + 5 * MINUTE, "1 h 05"],
    [HOUR + 10 * MINUTE, "1 h 10"],
    [23 * HOUR + 59 * MINUTE, "23 h 59"],
    [DAY, "1 j"],
    [3 * DAY + 4 * HOUR + 30 * MINUTE, "3 j 4 h"],
    [150 * DAY, "150 j"],
  ])("writes %i ms as %s", (milliseconds, expected) => {
    expect(formatCompactDuration(milliseconds, t)).toBe(expected);
  });
});

import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { inTimeZone } from "@/test/timeZone";
import { dayHeading, dayName, episodeRange } from "./formatEpisode";

const LABELS: Record<string, string> = {
  "faults.history.today": "aujourd'hui",
  "faults.history.yesterday": "hier",
  "faults.history.ongoing": "en cours",
  "faults.history.nextDay": "{{time}} (lendemain)",
};

const t = ((key: string, options?: Record<string, unknown>) =>
  LABELS[key].replace(/{{(\w+)}}/g, (_, name) =>
    String(options?.[name]),
  )) as unknown as TFunction<"faults">;

// Martinique is UTC-4 all year: every expectation below is in its local time.
inTimeZone("America/Martinique");

/** Wednesday 14 October 2026, 14:40 in Martinique. */
const NOW = new Date("2026-10-14T18:40:00Z");

function range(start: string, end: string | null): string {
  return episodeRange(
    {
      startMs: Date.parse(start),
      endMs: end === null ? null : Date.parse(end),
    },
    t,
    "fr",
  );
}

describe("dayName", () => {
  it.each([
    ["2026-10-14T12:00:00Z", "aujourd'hui"],
    // 23:00 on the 13th in Martinique, though already the 14th in UTC.
    ["2026-10-14T03:00:00Z", "hier"],
    ["2026-10-12T15:00:00Z", "lundi 12 octobre"],
    ["2025-12-31T15:00:00Z", "mercredi 31 décembre 2025"],
  ])("names the local day of %s as %s", (moment, expected) => {
    expect(dayName(new Date(moment), NOW, t, "fr")).toBe(expected);
  });
});

describe("dayHeading", () => {
  it("capitalizes the day's name to head its alerts", () => {
    expect(dayHeading(new Date("2026-10-14T12:00:00Z"), NOW, t, "fr")).toBe(
      "Aujourd'hui",
    );
    expect(dayHeading(new Date("2026-10-12T15:00:00Z"), NOW, t, "fr")).toBe(
      "Lundi 12 octobre",
    );
  });
});

describe("episodeRange", () => {
  it("writes the local times an episode opened and closed", () => {
    expect(range("2026-10-14T11:12:00Z", "2026-10-14T11:58:00Z")).toBe(
      "07:12 → 07:58",
    );
  });

  it("says an episode still running is ongoing", () => {
    expect(range("2026-10-14T17:30:00Z", null)).toBe("13:30 → en cours");
  });

  it("marks an episode that closed on the next local day", () => {
    expect(range("2026-10-14T02:40:00Z", "2026-10-14T04:35:00Z")).toBe(
      "22:40 → 00:35 (lendemain)",
    );
  });

  it("dates the close of an episode that ran over several days", () => {
    expect(range("2026-10-10T14:00:00Z", "2026-10-12T13:12:00Z")).toBe(
      "10:00 → 12 oct. 09:12",
    );
  });
});

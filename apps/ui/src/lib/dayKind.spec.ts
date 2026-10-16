import { describe, expect, it } from "vitest";
import { inTimeZone } from "@/test/timeZone";
import { dayKind } from "./dayKind";

describe("dayKind", () => {
  const now = new Date(2026, 7, 5, 14, 30);

  it("buckets the current day as today", () => {
    expect(dayKind(new Date(2026, 7, 5, 0, 1), now)).toBe("today");
  });

  it("buckets the previous day as yesterday, across midnight", () => {
    expect(dayKind(new Date(2026, 7, 4, 23, 59), now)).toBe("yesterday");
  });

  it("buckets anything older as a date, across month boundaries", () => {
    expect(dayKind(new Date(2026, 6, 31), now)).toBe("date");
  });

  describe("across a clock change", () => {
    // Paris leaves summer time on 25 October 2026: that day lasts 25 hours.
    inTimeZone("Europe/Paris");

    it("still buckets the day before as yesterday", () => {
      expect(dayKind(new Date(2026, 9, 25, 12), new Date(2026, 9, 26, 9))).toBe(
        "yesterday",
      );
    });
  });
});

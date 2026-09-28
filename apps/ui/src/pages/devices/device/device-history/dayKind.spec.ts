import { describe, expect, it } from "vitest";
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
});

import { describe, expect, it } from "vitest";
import { timeTickFormat } from "./timeTickFormat";

// Local-time dates: the axis reads the viewer's clock, and so do the ticks.
const at = (h: number, m = 0, s = 0) => new Date(2026, 7, 5, h, m, s);

describe("timeTickFormat", () => {
  const fr = timeTickFormat("fr-FR");
  const en = timeTickFormat("en-US");

  it("names the time of day on a tick within a day", () => {
    expect(fr(at(14, 30))).toBe("14:30");
    expect(en(at(14, 30))).toBe("02:30 PM");
  });

  it("keeps the seconds on a tick between two minutes", () => {
    expect(fr(at(14, 30, 15))).toBe("14:30:15");
  });

  it("names the day on a midnight tick", () => {
    expect(fr(at(0))).toBe("5 août");
    expect(en(at(0))).toBe("Aug 5");
  });

  it("names the month on a tick at the first of a month", () => {
    expect(fr(new Date(2026, 7, 1))).toBe("août");
    expect(en(new Date(2026, 7, 1))).toBe("Aug");
  });

  it("names the year on a tick at the first of January", () => {
    expect(fr(new Date(2026, 0, 1))).toBe("2026");
    expect(en(new Date(2026, 0, 1))).toBe("2026");
  });
});

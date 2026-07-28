import { describe, expect, it } from "vitest";
import { describeCronExpression } from "./cronDescription";

describe("describeCronExpression", () => {
  it("describes the full recurrence in English", () => {
    expect(describeCronExpression("0 10 * * *", "en-US")).toBe(
      "At 10:00 AM, every day",
    );
  });

  it("localizes the description and time format in French", () => {
    expect(describeCronExpression("30 8 * * 1-5", "fr-FR")).toBe(
      "À 08:30, de lundi à vendredi",
    );
  });

  it("returns null for a missing or invalid expression", () => {
    expect(describeCronExpression("", "en")).toBeNull();
    expect(describeCronExpression("not a cron", "en")).toBeNull();
  });
});

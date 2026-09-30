import { describe, expect, it } from "vitest";
import { sectionActivity } from "./controlPanelSection";

const CONDITION = { device_id: "plc", attribute: "auto_mode", value: false };

describe("sectionActivity", () => {
  it.each([
    ["no condition", undefined, undefined, "active"],
    ["the expected reading", CONDITION, false, "active"],
    ["the opposite reading", CONDITION, true, "inactive"],
    ["no reading yet", CONDITION, null, "unknown"],
    ["a missing attribute", CONDITION, undefined, "unknown"],
    // `value` defaults to true when the stored condition omits it.
    [
      "a defaulted value",
      { device_id: "plc", attribute: "enabled" },
      true,
      "active",
    ],
  ] as const)("is judged on %s", (_name, condition, reading, expected) => {
    expect(sectionActivity(condition, reading)).toBe(expected);
  });
});

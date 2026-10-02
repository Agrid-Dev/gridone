import { describe, expect, it } from "vitest";
import {
  blockedToggleReasons,
  sectionActivity,
  sectionDevice,
} from "./controlPanelSection";

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

const REASON = { code: "pump_pair_exclusive" };
// What the server ships for a start command refused while the twin pump runs.
const OPTIONS = [
  { value: false, available: true, reasons: [] },
  { value: true, available: false, reasons: [REASON] },
];

describe("blockedToggleReasons", () => {
  it.each([
    ["the refused direction", OPTIONS, false, [REASON]],
    // The rule refuses a start; stopping a running pump stays possible.
    ["the allowed direction", OPTIONS, true, null],
    ["a value not reported yet", OPTIONS, null, null],
    ["an attribute with no resolved options", undefined, false, null],
  ] as const)("judges %s", (_name, options, displayed, expected) => {
    expect(blockedToggleReasons(options, displayed)).toEqual(expected);
  });
});

const linked = (device_id: string, attribute = "running") => ({
  device_id,
  attribute,
  link: true,
});

describe("sectionDevice", () => {
  it.each([
    [
      "every row linked to one device",
      [linked("pump1"), linked("pump1", "fault")],
      "pump1",
    ],
    ["a single linked row", [linked("pump1")], "pump1"],
    ["rows linked to two devices", [linked("pump1"), linked("pump2")], null],
    [
      "one row not linked",
      [linked("pump1"), { device_id: "pump1", attribute: "fault" }],
      null,
    ],
    [
      "one row explicitly not linked",
      [linked("pump1"), { ...linked("pump1", "fault"), link: false }],
      null,
    ],
    ["a row with no device picked yet", [linked(""), linked("")], null],
    ["no rows", [], null],
  ] as const)("is judged on %s", (_name, attributes, expected) => {
    expect(sectionDevice({ attributes: [...attributes] })).toBe(expected);
  });
});

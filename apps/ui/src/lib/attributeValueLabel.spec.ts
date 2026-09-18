import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import enCommon from "@/locales/en/common.json";
import frCommon from "@/locales/fr/common.json";
import {
  attributeValueLabel,
  attributeValueLabelKey,
  attributeValueText,
} from "./attributeValueLabel";

const LABELS: Record<string, string> = {
  "common.true": "True",
  "common.false": "False",
  "common.hvacMode.heat": "Heating",
  "common.hvacMode.fan": "Fan",
  "common.hvacMode.auto": "Auto",
  "common.fanSpeed.low": "Low",
  "common.fanSpeed.auto": "Auto speed",
};

const t = ((key: string, opts?: { defaultValue?: string }) =>
  LABELS[key] ?? opts?.defaultValue ?? key) as unknown as TFunction<"common">;

const MODE_ATTRIBUTES = ["mode", "hvac_mode", "hvac_real_mode"];
const FAN_ATTRIBUTES = ["fan", "fan_speed"];

const MODE_VALUES = [
  "heat",
  "cool",
  "fan",
  "dry",
  "auto",
  "off",
  "on",
  "error",
];
const FAN_VALUES = ["low", "medium", "high", "auto"];

describe("attributeValueLabelKey", () => {
  it.each(MODE_ATTRIBUTES)("reads %s as an HVAC mode", (name) => {
    expect(attributeValueLabelKey(name, "heat")).toBe("common.hvacMode.heat");
  });

  it.each(FAN_ATTRIBUTES)("reads %s as a fan speed", (name) => {
    expect(attributeValueLabelKey(name, "low")).toBe("common.fanSpeed.low");
  });

  it.each(MODE_VALUES)("covers the %s mode", (value) => {
    expect(attributeValueLabelKey("hvac_mode", value)).toBe(
      `common.hvacMode.${value}`,
    );
  });

  it.each(FAN_VALUES)("covers the %s fan speed", (value) => {
    expect(attributeValueLabelKey("fan_speed", value)).toBe(
      `common.fanSpeed.${value}`,
    );
  });

  it.each(["temperature_setpoint", "humidity", "power"])(
    "leaves %s outside both vocabularies",
    (name) => {
      expect(attributeValueLabelKey(name, "auto")).toBeUndefined();
    },
  );

  it.each([
    ["mode", "turbo"],
    ["hvac_real_mode", "eco"],
    ["fan", "heat"],
    ["fan_speed", "silent"],
  ])("leaves %s with an unknown value %s uncovered", (name, value) => {
    expect(attributeValueLabelKey(name, value)).toBeUndefined();
  });

  it.each([[0], [1], [21.5], [true], [false], [null], [undefined], [{}]])(
    "leaves the non-string value %s uncovered",
    (value) => {
      expect(attributeValueLabelKey("mode", value)).toBeUndefined();
      expect(attributeValueLabelKey("fan", value)).toBeUndefined();
    },
  );

  it("reads the same value against the attribute's own vocabulary", () => {
    expect(attributeValueLabelKey("mode", "fan")).toBe("common.hvacMode.fan");
    expect(attributeValueLabelKey("fan", "auto")).toBe("common.fanSpeed.auto");
    expect(attributeValueLabelKey("mode", "fan")).not.toBe(
      attributeValueLabelKey("fan", "auto"),
    );
  });

  it("keeps auto distinct between the two vocabularies", () => {
    expect(attributeValueLabelKey("mode", "auto")).toBe("common.hvacMode.auto");
    expect(attributeValueLabelKey("fan", "auto")).toBe("common.fanSpeed.auto");
  });
});

describe("attributeValueLabel", () => {
  it("translates a covered value", () => {
    expect(attributeValueLabel("hvac_mode", "heat", t)).toBe("Heating");
    expect(attributeValueLabel("fan_speed", "low", t)).toBe("Low");
  });

  it("translates the same value differently per attribute", () => {
    expect(attributeValueLabel("mode", "auto", t)).toBe("Auto");
    expect(attributeValueLabel("fan", "auto", t)).toBe("Auto speed");
  });

  it.each([
    ["temperature_setpoint", "auto"],
    ["mode", "turbo"],
    ["fan", 2],
    ["mode", null],
  ])("returns null rather than the raw value for %s / %s", (name, value) => {
    expect(attributeValueLabel(name, value, t)).toBeNull();
  });
});

describe("attributeValueText", () => {
  it("prefers the business label over the wire value", () => {
    expect(attributeValueText("mode", "heat", t)).toBe("Heating");
    expect(attributeValueText("fan", "low", t, "str")).toBe("Low");
  });

  it("falls back to formatValue for an uncovered attribute", () => {
    expect(attributeValueText("temperature_setpoint", "auto", t)).toBe("auto");
  });

  it("formats a float with its dataType", () => {
    expect(attributeValueText("temperature", 21.5, t, "float")).toBe("21.50");
    expect(attributeValueText("temperature", 21.5, t)).toBe("21.5");
  });

  it("renders a boolean", () => {
    expect(attributeValueText("occupancy", true, t)).toBe("True");
    expect(attributeValueText("occupancy", false, t)).toBe("False");
  });

  it("renders null as an em dash", () => {
    expect(attributeValueText("mode", null, t)).toBe("—");
    expect(attributeValueText("temperature", undefined, t, "float")).toBe("—");
  });
});

const EMITTED_KEYS = [
  ...MODE_ATTRIBUTES.flatMap((name) =>
    MODE_VALUES.map((value) => attributeValueLabelKey(name, value)),
  ),
  ...FAN_ATTRIBUTES.flatMap((name) =>
    FAN_VALUES.map((value) => attributeValueLabelKey(name, value)),
  ),
].filter((key): key is NonNullable<typeof key> => key !== undefined);

const UNIQUE_KEYS = [...new Set(EMITTED_KEYS)];

function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle,
    );
}

describe("locale coverage", () => {
  it("emits one key per value of each vocabulary", () => {
    expect(UNIQUE_KEYS).toHaveLength(MODE_VALUES.length + FAN_VALUES.length);
  });

  it.each(UNIQUE_KEYS)("%s is translated in en and fr", (key) => {
    expect(lookup(enCommon, key)).toEqual(expect.any(String));
    expect(lookup(frCommon, key)).toEqual(expect.any(String));
  });
});

describe("values that are Object.prototype member names", () => {
  it.each([
    "toString",
    "constructor",
    "valueOf",
    "hasOwnProperty",
    "__proto__",
  ])("treats %s as an unknown value, not an inherited entry", (value) => {
    expect(attributeValueLabelKey("mode", value)).toBeUndefined();
    expect(attributeValueLabelKey("fan", value)).toBeUndefined();
    expect(attributeValueLabel("mode", value, t)).toBeNull();
  });
});

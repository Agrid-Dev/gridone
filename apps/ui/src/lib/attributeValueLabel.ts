import type { TFunction } from "i18next";
import { formatValue, type CellValue } from "./formatValue";

/**
 * Human labels for the enum values of standard device attributes.
 *
 * Drivers normalise their own encoding onto this shared vocabulary with a
 * `mapping` codec (the Agrid thermostat turns `HVAC_MODE_HEAT` into `heat`
 * and `FAN_SPEED_LOW` into `low`), and the presentation dialect carries no
 * per-option label. Translating the value is therefore a display concern of
 * the UI, not a driver one — and the wire value is never changed.
 *
 * Returns null for anything this vocabulary does not cover, so each call
 * site keeps its own fallback formatting.
 */

const HVAC_MODE_ATTRIBUTES = new Set(["mode", "hvac_mode", "hvac_real_mode"]);
const FAN_SPEED_ATTRIBUTES = new Set(["fan", "fan_speed"]);

const HVAC_MODE_LABEL_KEYS = {
  heat: "common.hvacMode.heat",
  cool: "common.hvacMode.cool",
  fan: "common.hvacMode.fan",
  dry: "common.hvacMode.dry",
  auto: "common.hvacMode.auto",
  idle: "common.hvacMode.idle",
  off: "common.hvacMode.off",
  on: "common.hvacMode.on",
  error: "common.hvacMode.error",
} as const;

const FAN_SPEED_LABEL_KEYS = {
  low: "common.fanSpeed.low",
  medium: "common.fanSpeed.medium",
  high: "common.fanSpeed.high",
  auto: "common.fanSpeed.auto",
} as const;

type ValueLabelKey =
  | (typeof HVAC_MODE_LABEL_KEYS)[keyof typeof HVAC_MODE_LABEL_KEYS]
  | (typeof FAN_SPEED_LABEL_KEYS)[keyof typeof FAN_SPEED_LABEL_KEYS];

/** Own-property lookup: a driver's `mapping` codec can normalise a value to
 *  any string, and a bare index would answer `Object.prototype` members such
 *  as `toString` or `constructor` with a function the cast hides. */
function lookup<T extends Record<string, ValueLabelKey>>(
  keys: T,
  value: string,
): ValueLabelKey | undefined {
  return Object.hasOwn(keys, value) ? keys[value] : undefined;
}

/** The label key for a (attribute, value) pair, or undefined when unknown. */
export function attributeValueLabelKey(
  attributeName: string,
  value: unknown,
): ValueLabelKey | undefined {
  if (typeof value !== "string") return undefined;
  if (HVAC_MODE_ATTRIBUTES.has(attributeName)) {
    return lookup(HVAC_MODE_LABEL_KEYS, value);
  }
  if (FAN_SPEED_ATTRIBUTES.has(attributeName)) {
    return lookup(FAN_SPEED_LABEL_KEYS, value);
  }
  return undefined;
}

/** Translated label, or null when the vocabulary does not cover the value. */
export function attributeValueLabel(
  attributeName: string,
  value: unknown,
  t: TFunction<"common">,
): string | null {
  const key = attributeValueLabelKey(attributeName, value);
  return key ? t(key, { defaultValue: String(value) }) : null;
}

/** What to show for an attribute value: its business label when this
 *  vocabulary covers it, the formatted wire value otherwise. */
export function attributeValueText(
  attributeName: string,
  value: CellValue,
  t: TFunction<"common">,
  dataType?: string,
): string {
  if (typeof value === "boolean")
    return t(value ? "common.true" : "common.false");
  return (
    attributeValueLabel(attributeName, value, t) ?? formatValue(value, dataType)
  );
}

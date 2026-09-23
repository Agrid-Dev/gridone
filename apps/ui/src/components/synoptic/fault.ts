import type { Severity } from "@gridone/sdk";

/**
 * How a device's fault colours the plate, by severity, after the meanings
 * IEC 60073 gives indicator colours: red for what must be acted on now,
 * amber for an abnormal condition, and nothing louder than the muted tone
 * for what is only for information, so a column of "info" faults never
 * outshouts the one alert among them (the faults table greys `info` for
 * the same reason). One table per drawing primitive; nothing else on the
 * plate names a fault colour.
 */
export const FAULT_STROKE_CLASS: Record<Severity, string> = {
  alert: "stroke-status-error",
  warning: "stroke-status-warning",
  info: "stroke-muted-foreground",
};

export const FAULT_FILL_CLASS: Record<Severity, string> = {
  alert: "fill-status-error",
  warning: "fill-status-warning",
  info: "fill-muted-foreground",
};

/** For HTML beside the plate (the navigation panel, the legend). */
export const FAULT_BG_CLASS: Record<Severity, string> = {
  alert: "bg-status-error",
  warning: "bg-status-warning",
  info: "bg-muted-foreground",
};

export const FAULT_TEXT_CLASS: Record<Severity, string> = {
  alert: "text-status-error",
  warning: "text-status-warning",
  info: "text-muted-foreground",
};

/** The level a device's fault is drawn at: its worst active severity, or
 *  an alert when the device is faulty and its severity is not known (a
 *  fault attribute with no severity, a fixture that names none, or a
 *  severity this build has no colour for: the API is not validated at
 *  runtime, and a fault must never lose its colour). Null for a healthy
 *  device. */
export function faultLevel(
  faulty: boolean,
  severity?: Severity | null,
): Severity | null {
  if (!faulty) return null;
  return severity && severity in FAULT_STROKE_CLASS ? severity : "alert";
}

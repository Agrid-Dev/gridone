import type { Device } from "@gridone/sdk";
import { attributeUnit } from "@/lib/attributeUnits";
import {
  attributeReading,
  deviceMeasureReading,
  formatReading,
  type ReadingSpec,
} from "@/lib/deviceSummary";
import type { RunState } from "./fleet-status";
import type { FleetLead, FleetLeadContext, FleetLeadLine } from "./types";

/** A value the device's current mode does not use. */
const NOT_APPLICABLE = "N/A";

/** The primary line of a device that reports nothing to lead with. */
export const EMPTY_LEAD: FleetLead = { primary: { value: "—" } };

/** Setpoint first ("21,0 °C consigne"), what the unit measures under it
 *  ("19,6 °C mesurée"). The type names its setpoint attribute (`setpoint`);
 *  the measure is its primary one. Without a reported setpoint the measure
 *  leads alone. A setpoint the current mode does not use (`inapplicable`)
 *  still leads, as N/A, rather than leaving the measure to pass for one. */
export function setpointLead(
  device: Device,
  { t, locale }: FleetLeadContext,
  {
    setpoint: spec,
    measureLabel,
    inapplicable = false,
  }: { setpoint: ReadingSpec; measureLabel: string; inapplicable?: boolean },
): FleetLead {
  const setpoint = attributeReading(device, spec);
  const measure = deviceMeasureReading(device);
  const measured: FleetLeadLine | null =
    measure?.value != null
      ? { value: formatReading(measure, locale), label: measureLabel }
      : null;
  if (!inapplicable && setpoint.value == null)
    return measured ? { primary: measured } : EMPTY_LEAD;
  return {
    primary: {
      value: inapplicable ? NOT_APPLICABLE : formatReading(setpoint, locale),
      label: t("devices.card.lead.setpoint"),
    },
    secondary: measured,
  };
}

/** The device's primary measure alone — the lead of a type with nothing
 *  better to say, and of a device of no registered type (an em dash). */
export function measureLead(
  device: Device,
  { locale }: FleetLeadContext,
  label?: string,
): FleetLead {
  const measure = deviceMeasureReading(device);
  if (measure?.value == null) return EMPTY_LEAD;
  return { primary: { value: formatReading(measure, locale), label } };
}

/** A numeric attribute's `value` as a lead line, in the unit its attribute
 *  declares, or null when the device does not report it. */
export function attributeLine(
  device: Device,
  name: string,
  value: number | null,
  { locale }: FleetLeadContext,
  label: string,
  digits = 0,
): FleetLeadLine | null {
  if (value == null) return null;
  const unit = attributeUnit(name, device.attributes?.[name]);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return {
    value: unit ? `${number}${unit === "°" ? "" : " "}${unit}` : number,
    label,
  };
}

/** A machine's run state in words ("En marche"), toned while running. */
export function runStateLine(
  state: RunState,
  { t }: FleetLeadContext,
  runningTone = "text-foreground",
): FleetLeadLine {
  return {
    value: t(`devices.card.lead.runState.${state}`),
    tone: state === "running" ? runningTone : "text-muted-foreground",
  };
}

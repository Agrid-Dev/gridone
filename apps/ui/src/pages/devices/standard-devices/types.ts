import type { TFunction } from "i18next";
import type { Device } from "@gridone/sdk";
import type { Feedback } from "@/hooks/useDeviceDetails";

/** Props passed to a standard type's fleet-card glyph. */
export type StandardFleetGlyphProps = {
  device: Device;
};

/** One line of the fleet card lead: a value, the muted label saying what a
 *  bare number is ("consigne", "mesurée"), and an optional tone for a worded
 *  state ("Liquide détecté" in the water tone). */
export type FleetLeadLine = {
  value: string;
  label?: string;
  tone?: string;
};

/** The fleet card lead: a primary line and an optional secondary one. Data
 *  only — one renderer (`FleetLeadView`) owns the typography, so every type
 *  reads at the same sizes. */
export type FleetLead = {
  primary: FleetLeadLine;
  secondary?: FleetLeadLine | null;
};

export type FleetLeadContext = {
  t: TFunction<["devices", "standardDevices"]>;
  locale: string;
};

/** A type's lead from its device state. */
export type FleetLeadOf = (device: Device, ctx: FleetLeadContext) => FleetLead;

/** Props passed to every standard device control (detail view). */
export type StandardControlProps = {
  device: Device;
  draft: Record<string, string | number | boolean | null>;
  savingAttr: string | null;
  feedback: Feedback | null;
  onDraftChange: (
    name: string,
    value: string | number | boolean | null,
  ) => void;
  onSave: (name: string) => void;
};

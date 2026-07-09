import type { AttributeKind, DataType, Device, Severity } from "@gridone/sdk";
import {
  deviceAttributes,
  type AttributeValue,
  type DeviceAttribute,
} from "@/lib/devices";

/** Typed view over a device attribute's wire fields. The generated SDK
 *  schema (`Attribute`) is an untyped map, so we narrow it here — fields
 *  mirror the backend's `devices_manager` `Attribute` model (snake_case). */
export type AttributeFields = {
  kind: AttributeKind;
  name: string;
  data_type: DataType;
  read_write_modes: string[];
  current_value: AttributeValue | null;
  last_updated: string | null;
  last_changed: string | null;
  value_options?: AttributeValue[];
};

/** Typed view of a fault-kind attribute (severity + computed `is_faulty`). */
export type FaultAttribute = AttributeFields & {
  kind: "fault";
  severity: Severity;
  is_faulty: boolean;
};

const SEVERITY_RANK: Record<Severity, number> = {
  alert: 0,
  warning: 1,
  info: 2,
};

export function isFaultAttribute(
  attr: DeviceAttribute,
): attr is FaultAttribute {
  return attr.kind === "fault";
}

export function getActiveFaults(device: Device): FaultAttribute[] {
  return getAllFaultAttributes(device).filter((attr) => attr.is_faulty);
}

export function getHighestActiveSeverity(device: Device): Severity | null {
  return getActiveFaults(device)[0]?.severity ?? null;
}

export function getAllFaultAttributes(device: Device): FaultAttribute[] {
  return Object.values(deviceAttributes(device))
    .filter(isFaultAttribute)
    .sort((a, b) => {
      if (a.is_faulty !== b.is_faulty) return a.is_faulty ? -1 : 1;
      if (a.is_faulty) {
        const bySeverity =
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (bySeverity !== 0) return bySeverity;
        const ta = a.last_changed ? Date.parse(a.last_changed) : 0;
        const tb = b.last_changed ? Date.parse(b.last_changed) : 0;
        return tb - ta;
      }
      return a.name.localeCompare(b.name);
    });
}

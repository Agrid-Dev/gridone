import type {
  Device,
  DeviceAttribute,
  FaultAttribute,
  Severity,
} from "@/api/devices";

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
  return Object.values(device.attributes)
    .filter(isFaultAttribute)
    .filter((attr) => attr.isFaulty)
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      const ta = a.lastChanged ? Date.parse(a.lastChanged) : 0;
      const tb = b.lastChanged ? Date.parse(b.lastChanged) : 0;
      return tb - ta;
    });
}

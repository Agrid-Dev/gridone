import type { Severity } from "./devices";
import { request } from "./request";

export type FaultView = {
  deviceId: string;
  deviceName: string;
  attributeName: string;
  severity: Severity;
  currentValue: string | number | boolean;
  lastUpdated: string;
  lastChanged: string;
};

export function listFaults(): Promise<FaultView[]> {
  return request<FaultView[]>("/devices/faults/", undefined, {
    camelCase: true,
  });
}

import type { StatusLevel } from "@/lib/semanticColors";

/** A 2D point in diagram coordinates. */
export type Pt = { x: number; y: number };

/** Status of an equipment indicator square. */
export type Status = StatusLevel | "off";

/** One value row of a monitor panel (e.g. SV / PV / OP). */
export type MonitorRow = {
  label: string;
  value: string | number;
  unit: string;
};

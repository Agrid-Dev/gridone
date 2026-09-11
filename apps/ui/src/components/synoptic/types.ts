/** A 2D point in diagram coordinates. */
export type Pt = { x: number; y: number };

/** Status of an equipment indicator square. */
export type Status = "ok" | "warn" | "idle";

/** One value row of a monitor panel (e.g. SV / PV / OP). */
export type MonitorRow = {
  label: string;
  value: string | number;
  unit: string;
};

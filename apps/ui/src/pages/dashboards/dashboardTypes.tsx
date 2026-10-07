import { Activity, History, type LucideIcon } from "lucide-react";
import type { DashboardType } from "@gridone/sdk";

/** What the UI knows about each dashboard type beyond its name. The backend
 *  owns the vocabulary and which widget types fit each (shipped on the
 *  widget schemas as `x-dashboard-types`); this map owns how the page
 *  behaves for it. A future type (a device list with preset filters, say)
 *  adds its entry here, and its own body when the grid stops being the only
 *  one. */
export type DashboardTypeDescriptor = {
  Icon: LucideIcon;
  /** Whether the page carries the period selector: only a dashboard whose
   *  widgets read over a viewing period has one. */
  hasPeriod: boolean;
};

export const DASHBOARD_TYPES: Record<DashboardType, DashboardTypeDescriptor> = {
  live: { Icon: Activity, hasPeriod: false },
  history: { Icon: History, hasPeriod: true },
};

/** The vocabulary in display order, for forms (`z.enum`) and pickers. */
export const DASHBOARD_TYPE_KEYS = [
  "live",
  "history",
] as const satisfies readonly DashboardType[];

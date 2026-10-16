import { isAwhp } from "@/lib/devices";
import type { StandardControlProps } from "../types";
import { AwhpControl } from "./AwhpControl";

/** AWHP supervision layout: the full-width figure of the unit. */
export function AwhpSupervision(props: StandardControlProps) {
  if (!isAwhp(props.device)) return null;
  return <AwhpControl {...props} size="full" />;
}

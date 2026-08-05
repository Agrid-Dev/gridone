import { isAwhp } from "@/lib/devices";
import type { StandardControlProps } from "../types";
import { AwhpControl } from "./AwhpControl";
import { AwhpChilledWaterCard } from "./AwhpChilledWaterCard";

/** AWHP supervision layout: the full-width refrigerant-cycle card above the
 *  24 h chilled-water chart. */
export function AwhpSupervision(props: StandardControlProps) {
  if (!isAwhp(props.device)) return null;
  return (
    <div className="space-y-6">
      <AwhpControl {...props} size="full" />
      <AwhpChilledWaterCard device={props.device} />
    </div>
  );
}

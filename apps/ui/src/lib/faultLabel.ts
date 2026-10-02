import type { FaultAttribute } from "@/lib/faults";
import { toLabel } from "./textFormat";

type FaultLabelInput = Pick<
  FaultAttribute,
  "name" | "data_type" | "current_value"
>;

/** What a fault row says: a string fault carries its own message, an int
 *  fault appends its code, a boolean fault is named after its attribute.
 *  `nameLabel` is how the attribute itself is named — the driver's label
 *  through `useAttributeLabel` where the caller has one, else the
 *  prettified attribute name. */
export function faultLabel(
  { name, data_type, current_value }: FaultLabelInput,
  nameLabel: string = toLabel(name),
): string {
  switch (data_type) {
    case "str":
      return current_value == null ? nameLabel : String(current_value);
    case "int":
      return `${nameLabel}: ${current_value ?? ""}`;
    case "bool":
    default:
      return nameLabel;
  }
}

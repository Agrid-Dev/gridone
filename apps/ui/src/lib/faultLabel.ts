import type { FaultAttribute } from "@/lib/faults";
import { toLabel } from "./textFormat";

type FaultLabelInput = Pick<
  FaultAttribute,
  "name" | "data_type" | "current_value"
>;

export function faultLabel({
  name,
  data_type,
  current_value,
}: FaultLabelInput): string {
  switch (data_type) {
    case "str":
      return current_value == null ? toLabel(name) : String(current_value);
    case "int":
      return `${toLabel(name)}: ${current_value ?? ""}`;
    case "bool":
    default:
      return toLabel(name);
  }
}

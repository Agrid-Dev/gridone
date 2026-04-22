import type { FaultAttribute } from "@/api/devices";
import { toLabel } from "./textFormat";

type FaultLabelInput = Pick<
  FaultAttribute,
  "name" | "dataType" | "currentValue"
>;

export function faultLabel({
  name,
  dataType,
  currentValue,
}: FaultLabelInput): string {
  switch (dataType) {
    case "str":
      return currentValue == null ? toLabel(name) : String(currentValue);
    case "int":
      return `${toLabel(name)}: ${currentValue ?? ""}`;
    case "bool":
    default:
      return toLabel(name);
  }
}

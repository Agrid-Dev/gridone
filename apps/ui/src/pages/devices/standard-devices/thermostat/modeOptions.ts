import type { AttributeFields } from "@/lib/faults";
import { optionStates } from "@/components/device-ui/runtime/controls";

/** Preserve the driver's values and order, including unfamiliar modes. */
export function resolveModeOptions(
  modeAttr: AttributeFields | undefined,
): string[] {
  return (
    optionStates(modeAttr)
      ?.map((option) => option.value)
      .filter((value): value is string => typeof value === "string") ?? []
  );
}

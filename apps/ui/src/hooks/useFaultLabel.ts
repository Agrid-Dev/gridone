import { useCallback } from "react";
import type { FaultAttribute } from "@/lib/faults";
import { faultLabel } from "@/lib/faultLabel";
import { useAttributeLabel } from "./useAttributeLabel";

/** {@link faultLabel} naming the attribute the way the device page does:
 *  the driver's label when it declares one, else the standard-attribute
 *  translation, else the prettified name. */
export function useFaultLabel(): (attribute: FaultAttribute) => string {
  const attributeLabel = useAttributeLabel();
  return useCallback(
    (attribute: FaultAttribute) =>
      faultLabel(attribute, attributeLabel(attribute.name, attribute)),
    [attributeLabel],
  );
}

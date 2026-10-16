import { useCallback } from "react";
import type { DriverRef } from "@/contexts/DriverLabelsContext";
import { faultFields, faultLabel, type LabelledFault } from "@/lib/faultLabel";
import { useAttributeLabel } from "./useAttributeLabel";

export type FaultLabeller = (
  fault: LabelledFault,
  device?: DriverRef,
) => string;

/** Name faults through their device's driver or the server-labelled row. */
export function useFaultLabel(): FaultLabeller {
  const attributeLabel = useAttributeLabel();
  return useCallback(
    (fault: LabelledFault, device?: DriverRef) => {
      const fields = faultFields(fault);
      return faultLabel(
        fields,
        attributeLabel(fields.name, "attribute_name" in fault ? fault : device),
      );
    },
    [attributeLabel],
  );
}

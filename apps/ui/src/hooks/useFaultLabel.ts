import { useCallback } from "react";
import type { FaultView } from "@gridone/sdk";
import type { FaultAttribute } from "@/lib/faults";
import { faultLabel } from "@/lib/faultLabel";
import { useAttributeLabel } from "./useAttributeLabel";

/** A fault as the device page holds it (the attribute) or as a fault list
 *  receives it (the `FaultView` row); both carry the driver's label. */
export type LabelledFault = FaultAttribute | FaultView;

export type FaultLabeller = (fault: LabelledFault) => string;

/** {@link faultLabel} naming the attribute the way the device page does:
 *  the driver's label when it declares one, else the standard-attribute
 *  translation, else the prettified name. */
export function useFaultLabel(): FaultLabeller {
  const attributeLabel = useAttributeLabel();
  return useCallback(
    (fault: LabelledFault) => {
      const name =
        "attribute_name" in fault ? fault.attribute_name : fault.name;
      return faultLabel(
        {
          name,
          data_type: fault.data_type,
          current_value: fault.current_value,
        },
        attributeLabel(name, fault),
      );
    },
    [attributeLabel],
  );
}

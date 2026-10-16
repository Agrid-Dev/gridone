import { useCallback } from "react";
import type { FaultEpisode, FaultView } from "@gridone/sdk";
import type { FaultAttribute } from "@/lib/faults";
import { faultLabel } from "@/lib/faultLabel";
import { useAttributeLabel } from "./useAttributeLabel";

/** A fault as the device page holds it (the attribute), as a fault list
 *  receives it (the `FaultView` row), or as the alert history rebuilt it (the
 *  `FaultEpisode`, valued as it opened); all carry the driver's label. */
export type LabelledFault = FaultAttribute | FaultView | FaultEpisode;

export type FaultLabeller = (fault: LabelledFault) => string;

/** What {@link faultLabel} reads of a fault, whichever shape holds it. */
export function faultFields(fault: LabelledFault) {
  return {
    name: "attribute_name" in fault ? fault.attribute_name : fault.name,
    data_type: fault.data_type,
    current_value: "value" in fault ? fault.value : fault.current_value,
  };
}

/** {@link faultLabel} naming the attribute the way the device page does:
 *  the driver's label when it declares one, else the standard-attribute
 *  translation, else the prettified name. */
export function useFaultLabel(): FaultLabeller {
  const attributeLabel = useAttributeLabel();
  return useCallback(
    (fault: LabelledFault) => {
      const fields = faultFields(fault);
      return faultLabel(fields, attributeLabel(fields.name, fault));
    },
    [attributeLabel],
  );
}

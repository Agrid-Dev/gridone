import { useCallback } from "react";
import type { ResolvedOption, ValueLabel } from "@gridone/sdk";
import type { SwitchSides } from "@/components/forms/controllers/SwitchController";
import { useValueLabel } from "@/hooks/useValueLabel";
import { commandReasons } from "@/lib/commandReasons";

type BooleanOption = {
  value: boolean;
  label: string;
  disabled: boolean;
  reason: string;
};

/** How a boolean attribute is edited: a switch reading both states in the
 *  driver's words, or, when the server's projection constrains a state, the
 *  two states as options so the constrained one keeps its reason and the
 *  other stays one click away. */
export type BooleanField =
  | { kind: "switch"; sides: SwitchSides }
  | { kind: "select"; options: BooleanOption[] };

const STATES = [false, true] as const;

export function useBooleanField(): (
  valueLabels?: ValueLabel[] | null,
  options?: ResolvedOption[] | null,
) => BooleanField {
  const labelFor = useValueLabel();
  return useCallback(
    (valueLabels?: ValueLabel[] | null, options?: ResolvedOption[] | null) => {
      const label = (state: boolean) => labelFor(state, valueLabels);
      // A driver can declare `write_options` that leave a state out entirely,
      // so a state missing from a non-empty projection is constrained too.
      const projected = (state: boolean) =>
        options?.find((option) => option.value === state);
      const constrained =
        !!options?.length &&
        STATES.some((state) => projected(state)?.available !== true);
      if (!constrained) {
        return {
          kind: "switch",
          sides: { false: label(false), true: label(true) },
        };
      }
      return {
        kind: "select",
        options: STATES.map((state) => ({
          value: state,
          label: label(state),
          disabled: projected(state)?.available !== true,
          reason: commandReasons(projected(state)?.reasons),
        })),
      };
    },
    [labelFor],
  );
}

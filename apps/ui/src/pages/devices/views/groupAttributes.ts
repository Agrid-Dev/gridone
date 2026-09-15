import type {
  Device,
  Driver,
  AttributeWriteState,
  ResolvedOption,
} from "@gridone/sdk";
import type { Scalar } from "@/components/device-ui/conditions";
import type { AttributeLike } from "@/components/device-ui/runtime";

export type GroupValueState = "common" | "multiple" | "partial" | "unavailable";
export type GroupAttribute = AttributeLike & {
  state: GroupValueState;
  missing: number;
};

/** A value is common only when every member has reported the same scalar. */
export function aggregateGroupAttributes(
  driver: Driver,
  members: Device[],
  memberCount: number,
): Record<string, GroupAttribute> {
  return Object.fromEntries(
    driver.attributes.map((attribute) => {
      const values = members
        .map((member) => member.attributes?.[attribute.name]?.current_value)
        .filter(
          (value): value is Scalar => value !== undefined && value !== null,
        );
      const missing = memberCount - values.length;
      const state: GroupValueState = !values.length
        ? "unavailable"
        : missing > 0
          ? "partial"
          : values.every((value) => value === values[0])
            ? "common"
            : "multiple";
      return [
        attribute.name,
        {
          ...attribute,
          write_state: aggregateWriteStates(
            members.map(
              (member) =>
                member.attributes?.[attribute.name]?.write_state as
                  | AttributeWriteState
                  | undefined,
            ),
          ),
          value_options: (members[0]?.attributes?.[attribute.name]
            ?.value_options ?? []) as Scalar[],
          read_write_modes: [
            ...(attribute.read ? ["read"] : []),
            ...(attribute.write ? ["write"] : []),
          ],
          current_value: state === "common" ? values[0] : null,
          state,
          missing,
        },
      ];
    }),
  );
}

/** Only combine server projections; mixed bounds are left to per-device previews. */
function aggregateWriteStates(
  states: (AttributeWriteState | undefined)[],
): AttributeWriteState {
  const options = new Map<string, ResolvedOption>();
  for (const state of states)
    for (const option of state?.options ?? []) {
      const key = JSON.stringify(option.value);
      if (!options.has(key) || option.available) options.set(key, option);
    }
  const constraints =
    states.length &&
    states.every(
      (state) =>
        JSON.stringify(state?.constraints) ===
        JSON.stringify(states[0]?.constraints),
    )
      ? states[0]?.constraints
      : null;
  return {
    status: states.some((state) => state?.status === "ready")
      ? "ready"
      : "unknown",
    constraints,
    options: states.some((state) => state?.options != null)
      ? [...options.values()]
      : null,
    candidate_required: true,
  };
}

/** Aggregate resolved flags only; mixed layout choices use the generic group UI. */
export function aggregatePresentationState(
  members: Device[],
): Record<string, boolean> | undefined {
  const states = members.map((member) => member.presentation_state ?? {});
  const keys = [...new Set(states.flatMap((state) => Object.keys(state)))];
  const selected = keys.filter((key) => key.endsWith("/selected"));
  if (
    selected.some(
      (key) =>
        states.some((state) => state[key] === true) &&
        !states.every((state) => state[key] === true),
    )
  )
    return undefined;
  return Object.fromEntries(
    keys.map((key) => [key, states.some((state) => state[key] === true)]),
  );
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  DeviceUiRuntime,
  ControlSpec,
} from "@/components/device-ui/runtime";
import {
  nextValue,
  resolveConstraints,
  optionStates,
} from "@/components/device-ui/runtime/controls";
import type { Scalar } from "@/components/device-ui/conditions";
import type { GroupAttribute } from "./groupAttributes";

/** Controls edit local targets; measurements and conditions use reported values. */
export function useGroupRuntime(
  attributes: Record<string, GroupAttribute>,
  controls: Record<string, ControlSpec>,
  canWrite: boolean,
  stage: (attribute: string, value: Scalar) => void,
  choose: (attribute: string) => void,
  drafts: Readonly<Record<string, Scalar>> = {},
  presentationState?: Record<string, boolean>,
): DeviceUiRuntime {
  const { t } = useTranslation("devices");
  return useMemo(() => {
    const reported = (name: string) => attributes[name]?.current_value ?? null;
    const valueLabel = (name: string) => {
      const attribute = attributes[name];
      return !attribute || attribute.state === "common"
        ? undefined
        : t(`groups.values.${attribute.state}`, { count: attribute.missing });
    };
    const readControl: DeviceUiRuntime["readControl"] = (id) => {
      const spec = controls[id];
      if (!spec) return undefined;
      const attribute = attributes[spec.attribute];
      const current = reported(spec.attribute);
      const hasDraft = Object.hasOwn(drafts, spec.attribute);
      const displayed = hasDraft ? drafts[spec.attribute] : current;
      const constraints = resolveConstraints(attribute?.write_state);
      const visible =
        !spec.conditionalVisibility ||
        presentationState?.[`/controls/${id}/visible`] === true;
      const writable =
        visible &&
        (!spec.conditionalInteraction ||
          presentationState?.[`/controls/${id}/enabled`] === true) &&
        canWrite &&
        !!attribute?.read_write_modes.includes("write");
      const can = (op: Parameters<typeof nextValue>[0]) =>
        writable &&
        !!attribute &&
        nextValue(op, spec, attribute, displayed, constraints) !== null;
      return {
        spec,
        attribute,
        reported: current,
        displayed,
        valueLabel: hasDraft
          ? t("groups.draftValue")
          : valueLabel(spec.attribute),
        writable,
        visible,
        write: { kind: "idle" },
        pending: false,
        constraints,
        options: optionStates(attribute)?.map((option) => option.value) ?? [],
        optionStates: optionStates(attribute),
        reasons: attribute?.write_state?.reasons,
        canIncrement: can("increment"),
        canDecrement: can("decrement"),
        canToggle: can("toggle"),
        canCycle: can("cycle"),
      };
    };
    return {
      reported,
      valueLabel,
      readControl,
      chooseValue: (id) => {
        const state = readControl(id);
        if (state?.writable) choose(state.spec.attribute);
      },
      setValue: (id, value) => {
        const state = readControl(id);
        if (
          state?.writable &&
          state.optionStates?.find((option) => option.value === value)
            ?.available !== false
        )
          stage(state.spec.attribute, value);
      },
      activate: (action) => {
        const state = readControl(action.control);
        if (!state?.writable || !state.attribute) return;
        const value = nextValue(
          action.op,
          state.spec,
          state.attribute,
          state.displayed,
          state.constraints,
        );
        if (value === null) choose(state.spec.attribute);
        else stage(state.spec.attribute, value);
      },
    };
  }, [
    attributes,
    controls,
    canWrite,
    stage,
    choose,
    drafts,
    presentationState,
    t,
  ]);
}

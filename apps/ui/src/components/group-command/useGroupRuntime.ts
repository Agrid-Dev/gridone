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
import {
  judgeWith,
  type ConditionJudge,
  type Scalar,
} from "@/components/device-ui/conditions";
import { localize } from "@/lib/localizedText";
import { toLabel } from "@/lib/textFormat";
import type { GroupAttribute } from "./groupAttributes";

/** Controls edit local targets; measurements and conditions use reported values. */
export function useGroupRuntime(
  attributes: Record<string, GroupAttribute>,
  controls: Record<string, ControlSpec>,
  canWrite: boolean,
  stage: (attribute: string, value: Scalar) => void,
  choose: (attribute: string) => void,
  drafts: Readonly<Record<string, Scalar>> = {},
  judge?: ConditionJudge,
): DeviceUiRuntime {
  const { t, i18n } = useTranslation("devices");
  const language = i18n.language;
  return useMemo(() => {
    const reported = (name: string) => attributes[name]?.current_value ?? null;
    const attributeLabel = (name: string) => {
      const label = attributes[name]?.label;
      return label ? localize(label, language) : toLabel(name);
    };
    const attributeDescription = (name: string) => {
      const description = attributes[name]?.description;
      return description ? localize(description, language) : undefined;
    };
    const holds = judge ?? judgeWith(reported);
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
      const visible = !spec.visibleWhen || holds(spec.visibleWhen, "true");
      const writable =
        visible &&
        (!spec.blockedWhen || holds(spec.blockedWhen, "false")) &&
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
      attributeLabel,
      attributeDescription,
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
    judge,
    t,
    language,
  ]);
}

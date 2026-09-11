import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  DeviceUiRuntime,
  ControlSpec,
} from "@/components/device-ui/runtime";
import {
  nextValue,
  resolveConstraints,
} from "@/components/device-ui/runtime/controls";
import type { Scalar } from "@/components/device-ui/conditions";
import type { GroupAttribute } from "./groupAttributes";

/** Presentation controls prepare absolute commands; reported values remain untouched. */
export function useGroupRuntime(
  attributes: Record<string, GroupAttribute>,
  controls: Record<string, ControlSpec>,
  canWrite: boolean,
  prepare: (attribute: string, value: Scalar) => void,
  choose: (attribute: string) => void,
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
      const constraints = resolveConstraints(
        attribute?.write_constraints,
        reported,
      );
      const writable =
        canWrite && !!attribute?.read_write_modes.includes("write");
      const can = (op: Parameters<typeof nextValue>[0]) =>
        writable &&
        !!attribute &&
        nextValue(op, spec, attribute, current, constraints) !== null;
      return {
        spec,
        attribute,
        reported: current,
        displayed: current,
        valueLabel: valueLabel(spec.attribute),
        writable,
        write: { kind: "idle" },
        pending: false,
        constraints,
        options: attribute?.value_options ?? [],
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
        if (state?.writable) prepare(state.spec.attribute, value);
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
        else prepare(state.spec.attribute, value);
      },
    };
  }, [attributes, controls, canWrite, prepare, choose, t]);
}

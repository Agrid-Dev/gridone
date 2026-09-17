import { useCallback, useEffect, useMemo } from "react";
import type { Device, ResolvedOption, WriteReason } from "@gridone/sdk";
import { useAttributeCommandRuntime } from "@/hooks/useAttributeCommandRuntime";
import { deviceAttributes } from "@/lib/devices";
import { judgeWith, type Scalar } from "../conditions";
import type { FaceAction } from "../face";
import { DEFAULT_DEBOUNCE_MS, type WriteState } from "./controlRuntime";
import {
  isWritable,
  isSliderValue,
  nextValue,
  resolveConstraints,
  optionStates,
  type AttributeLike,
  type ControlSpec,
  type ResolvedConstraints,
} from "./controls";

export type BoundControlState = {
  valueLabel?: string;
  spec: ControlSpec;
  attribute: AttributeLike | null;
  reported: Scalar | null;
  displayed: Scalar | null;
  writable: boolean;
  visible?: boolean;
  reasons?: WriteReason[];
  optionStates?: ResolvedOption[];
  write: WriteState;
  pending: boolean;
  constraints: ResolvedConstraints;
  /** Options of a select control, from the attribute contract. */
  options: readonly Scalar[];
  canIncrement: boolean;
  canDecrement: boolean;
  canToggle: boolean;
  canCycle: boolean;
};

export type DeviceUiRuntime = {
  /** A group can require an explicit absolute target for mixed values. */
  chooseValue?(id: string): void;
  valueLabel?(attribute: string): string | undefined;
  readControl(id: string): BoundControlState | undefined;
  /** Write a value; number changes are debounced unless `immediate`. */
  setValue(id: string, value: Scalar, options?: { immediate?: boolean }): void;
  /** Perform a face action on a declared control. */
  activate(action: FaceAction): void;
  /** Value of a binding (attribute) as reported by the device. */
  reported(attribute: string): Scalar | null;
};

/**
 * Binds the command runtime to a device: reported values come from the
 * device object (kept fresh by the query cache and WebSocket updates),
 * writes go through the commands endpoint with confirmation, and the
 * device is refetched once a write completes so the reported value catches
 * up even without a push. The runtime is recreated (and the old one
 * detached) when the device changes, so nothing pending leaks across.
 */
export function useDeviceControlRuntime(
  device: Device,
  controls: Record<string, ControlSpec>,
  {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    canWrite = true,
  }: {
    debounceMs?: number;
    canWrite?: boolean;
  } = {},
): DeviceUiRuntime & { busy: boolean } {
  const runtime = useAttributeCommandRuntime(device.id, debounceMs);

  const attributes = deviceAttributes(device) as Record<string, AttributeLike>;
  useEffect(() => {
    for (const [name, attribute] of Object.entries(attributes)) {
      runtime.setReported(name, attribute.current_value ?? null);
    }
  }, [runtime, attributes]);

  const reported = useCallback(
    (attribute: string) => attributes[attribute]?.current_value ?? null,
    [attributes],
  );
  const judge = useMemo(() => judgeWith(reported), [reported]);

  const readControl = useCallback(
    (id: string): BoundControlState | undefined => {
      const spec = controls[id];
      if (!spec) return undefined;
      const attribute = attributes[spec.attribute] ?? null;
      const snapshot = runtime.snapshot(spec.attribute);
      const constraints = resolveConstraints(attribute?.write_state);
      const visible = !spec.visibleWhen || judge(spec.visibleWhen, "true");
      const writable =
        visible &&
        (!spec.blockedWhen || judge(spec.blockedWhen, "false")) &&
        canWrite &&
        attribute !== null &&
        isWritable(attribute);
      const can = (op: FaceAction["op"]) =>
        writable &&
        attribute !== null &&
        nextValue(op, spec, attribute, snapshot.displayed, constraints) !==
          null;
      return {
        spec,
        attribute,
        reported: snapshot.reported,
        displayed: snapshot.displayed,
        writable,
        visible,
        reasons: attribute?.write_state?.reasons,
        optionStates: optionStates(attribute),
        write: snapshot.write,
        pending: snapshot.pending,
        constraints,
        options: optionStates(attribute)?.map((option) => option.value) ?? [],
        canIncrement: can("increment"),
        canDecrement: can("decrement"),
        canToggle: can("toggle"),
        canCycle: can("cycle"),
      };
    },
    [controls, attributes, runtime, canWrite, judge],
  );

  const setValue = useCallback(
    (id: string, value: Scalar, options?: { immediate?: boolean }) => {
      const state = readControl(id);
      if (!state || !state.writable) return;
      if (
        state.optionStates?.find((option) => option.value === value)
          ?.available === false
      )
        return;
      if (
        state.spec.kind === "slider" &&
        !isSliderValue(value, state.constraints)
      )
        return;
      runtime.request(state.spec.attribute, value, {
        immediate:
          options?.immediate ??
          (state.spec.kind !== "number" && state.spec.kind !== "slider"),
      });
    },
    [readControl, runtime],
  );

  const activate = useCallback(
    (action: FaceAction) => {
      const state = readControl(action.control);
      if (!state || !state.writable || !state.attribute) return;
      const value = nextValue(
        action.op,
        state.spec,
        state.attribute,
        state.displayed,
        state.constraints,
      );
      if (value === null) return;
      runtime.request(state.spec.attribute, value, {
        immediate: action.op === "toggle" || action.op === "cycle",
      });
    },
    [readControl, runtime],
  );

  const busy = runtime.busy;
  return useMemo(
    () => ({ readControl, setValue, activate, reported, busy }),
    [readControl, setValue, activate, reported, busy],
  );
}

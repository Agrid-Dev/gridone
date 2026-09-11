import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isGridoneError, type Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { deviceAttributes } from "@/lib/devices";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import type { Scalar } from "../conditions";
import type { FaceAction } from "../face";
import {
  ControlRuntime,
  DEFAULT_DEBOUNCE_MS,
  type AttributeWriter,
  type WriteOutcome,
  type WriteState,
} from "./controlRuntime";
import {
  isWritable,
  isSliderValue,
  nextValue,
  resolveConstraints,
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

/** Backend outcome → runtime outcome: a 409 is an unconfirmed write. */
function outcomeOf(error: unknown): WriteOutcome {
  const message = serverErrorMessage(error) ?? "";
  if (isGridoneError(error) && error.status === 409) {
    return { kind: "unconfirmed", message };
  }
  return {
    kind: "error",
    message: message || (error instanceof Error ? error.message : ""),
  };
}

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
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const deviceId = device.id;

  const writer = useCallback<AttributeWriter>(
    async (attribute, value) => {
      try {
        await client.devices.sendCommand(deviceId, {
          attribute,
          value,
          confirm: true,
        });
      } catch (error) {
        return outcomeOf(error);
      }
      try {
        const updated = await client.devices.get(deviceId);
        queryClient.setQueryData<Device>(["device", deviceId], updated);
      } catch {
        // The write succeeded; a failed refresh only delays the reported
        // value until the next sync.
      }
      return { kind: "ok" };
    },
    [client, deviceId, queryClient],
  );

  // The runtime lives as long as the device is shown: a new client or query
  // client instance must not drop pending intentions, so the writer is read
  // through a ref instead of being a dependency of the runtime.
  const writerRef = useRef(writer);
  useEffect(() => {
    writerRef.current = writer;
  }, [writer]);
  const runtime = useMemo(
    () =>
      new ControlRuntime(
        (attribute, value) => writerRef.current(attribute, value),
        debounceMs,
      ),
    // deviceId stands in for the device identity on purpose.
    [deviceId, debounceMs],
  );
  // Attach in the effect body (not only detach in the cleanup): StrictMode
  // runs cleanup + effect again on the same memoized instance.
  useEffect(() => {
    runtime.attach();
    return () => runtime.detach();
  }, [runtime]);

  const attributes = deviceAttributes(device) as Record<string, AttributeLike>;
  useEffect(() => {
    for (const [name, attribute] of Object.entries(attributes)) {
      runtime.setReported(name, attribute.current_value ?? null);
    }
  }, [runtime, attributes]);

  // Re-render on every runtime notification: the snapshot must change, so
  // it is the runtime's version counter rather than the runtime itself.
  useSyncExternalStore(
    useCallback((listener) => runtime.subscribe(listener), [runtime]),
    () => runtime.version,
  );

  const reported = useCallback(
    (attribute: string) => attributes[attribute]?.current_value ?? null,
    [attributes],
  );

  const readControl = useCallback(
    (id: string): BoundControlState | undefined => {
      const spec = controls[id];
      if (!spec) return undefined;
      const attribute = attributes[spec.attribute] ?? null;
      const snapshot = runtime.snapshot(spec.attribute);
      const constraints = resolveConstraints(
        attribute?.write_constraints,
        reported,
      );
      const writable = canWrite && attribute !== null && isWritable(attribute);
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
        write: snapshot.write,
        pending: snapshot.pending,
        constraints,
        options: attribute?.value_options ?? [],
        canIncrement: can("increment"),
        canDecrement: can("decrement"),
        canToggle: can("toggle"),
        canCycle: can("cycle"),
      };
    },
    [controls, attributes, runtime, reported, canWrite],
  );

  const setValue = useCallback(
    (id: string, value: Scalar, options?: { immediate?: boolean }) => {
      const state = readControl(id);
      if (!state || !state.writable) return;
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

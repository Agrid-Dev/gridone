import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isGridoneError, type Device } from "@gridone/sdk";
import { toast } from "sonner";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { commandReasons } from "@/lib/commandReasons";
import {
  ControlRuntime,
  DEFAULT_DEBOUNCE_MS,
  type AttributeWriter,
} from "@/components/device-ui/runtime/controlRuntime";

/** Shared preflight and confirmed dispatch for every single-device editor. */
export function useAttributeWriter(deviceId: string): AttributeWriter {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  return useCallback(
    async (attribute, value) => {
      try {
        const preview = await client.devices.previewDeviceCommand(deviceId, {
          attribute,
          value,
        });
        if (!preview.eligible)
          return { kind: "error", message: commandReasons(preview.reasons) };
        if (preview.warnings?.length)
          toast.warning(commandReasons(preview.warnings));
        await client.devices.sendCommand(deviceId, {
          attribute,
          value,
          confirm: true,
        });
      } catch (error) {
        return {
          kind:
            isGridoneError(error) && error.status === 409
              ? "unconfirmed"
              : "error",
          message: serverErrorMessage(error) ?? "",
        };
      }
      try {
        const updated = await client.devices.get(deviceId);
        queryClient.setQueryData<Device>(["device", deviceId], updated);
      } catch {
        /* Observations will catch up on the next normal sync. */
      }
      return { kind: "ok" };
    },
    [client, deviceId, queryClient],
  );
}

/** One queue per attribute, independent of the widget rendering it. */
export function useAttributeCommandRuntime(
  deviceId: string,
  debounceMs = DEFAULT_DEBOUNCE_MS,
) {
  const writer = useAttributeWriter(deviceId);
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
    [deviceId, debounceMs],
  );
  useEffect(() => {
    runtime.attach();
    return () => runtime.detach();
  }, [runtime]);
  useSyncExternalStore(
    useCallback((listener) => runtime.subscribe(listener), [runtime]),
    () => runtime.version,
  );
  return runtime;
}

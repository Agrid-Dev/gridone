import { useTranslation } from "react-i18next";
import { useAttributeConfirmation } from "@/contexts/AttributeConfirmationContext";
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
import { groupConflict } from "@/components/group-command/GroupError";
import type { TFunction } from "i18next";
import {
  ControlRuntime,
  DEFAULT_DEBOUNCE_MS,
  type AttributeWriter,
  type AttributePreparer,
  type WriteOutcome,
} from "@/components/device-ui/runtime/controlRuntime";

/** Prepare human consent before reserving the runtime's in-flight write slot. */
function useAttributePreparation(deviceId: string): AttributePreparer {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const requestConfirmation = useAttributeConfirmation();
  const { t, i18n } = useTranslation("devices");
  return useCallback(
    async (attribute, value, signal) => {
      const trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      try {
        const preview = await client.devices.previewDeviceCommand(deviceId, {
          attribute,
          value,
        });
        if (signal.aborted) return { kind: "cancelled" };
        if (!preview.eligible)
          return { kind: "error", message: commandReasons(preview.reasons) };
        const language = i18n?.language || "en";
        if (preview.user_confirmation) {
          if (!preview.confirmation_token)
            return { kind: "error", message: "" };
          const accepted = await requestConfirmation({
            attribute,
            value,
            preview,
            language,
            signal,
            trigger,
          });
          if (!accepted || signal.aborted) return { kind: "cancelled" };
        }
        if (preview.warnings?.length)
          toast.warning(commandReasons(preview.warnings));
        return async () => {
          try {
            await client.devices.sendCommand(deviceId, {
              attribute,
              value,
              confirm: true,
              ...(preview.user_confirmation
                ? {
                    ui_confirmation_token: preview.confirmation_token,
                    confirmation_language: language,
                  }
                : {}),
            });
          } catch (error) {
            return writeError(error, t);
          }
          try {
            const updated = await client.devices.get(deviceId);
            queryClient.setQueryData<Device>(["device", deviceId], updated);
          } catch {
            /* Normal observations will catch up. */
          }
          return { kind: "ok" };
        };
      } catch (error) {
        return writeError(error, t);
      }
    },
    [client, deviceId, queryClient, requestConfirmation, i18n?.language, t],
  );
}

function writeError(error: unknown, t: TFunction<"devices">): WriteOutcome {
  const code = groupConflict(error)?.code;
  if (
    code === "command_preview_changed" ||
    code === "command_preview_expired"
  ) {
    return { kind: "error", message: t(`groups.errors.${code}`) };
  }
  return {
    kind:
      isGridoneError(error) && error.status === 409 ? "unconfirmed" : "error",
    message: serverErrorMessage(error) ?? "",
  };
}

/** Explicit-save editors use the same preflight and consent as live controls. */
export function useAttributeWriter(deviceId: string): AttributeWriter {
  const prepare = useAttributePreparation(deviceId);
  const active = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const requests = active.current;
    return () => {
      for (const abort of requests.values()) abort.abort();
      requests.clear();
    };
  }, [deviceId]);
  return useCallback(
    async (attribute, value) => {
      if (active.current.has(attribute)) return { kind: "cancelled" };
      const abort = new AbortController();
      active.current.set(attribute, abort);
      try {
        const prepared = await prepare(attribute, value, abort.signal);
        if (abort.signal.aborted) return { kind: "cancelled" };
        return typeof prepared === "function"
          ? await prepared(attribute, value)
          : prepared;
      } finally {
        if (active.current.get(attribute) === abort)
          active.current.delete(attribute);
      }
    },
    [prepare],
  );
}

/** One queue per attribute, independent of the widget rendering it. */
export function useAttributeCommandRuntime(
  deviceId: string,
  debounceMs = DEFAULT_DEBOUNCE_MS,
) {
  const prepare = useAttributePreparation(deviceId);
  const prepareRef = useRef(prepare);
  useEffect(() => {
    prepareRef.current = prepare;
  }, [prepare]);
  const runtime = useMemo(
    () =>
      new ControlRuntime(
        async () => ({ kind: "cancelled" }),
        debounceMs,
        (attribute, value, signal) =>
          prepareRef.current(attribute, value, signal),
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

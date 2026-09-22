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
  type PreparedSend,
  type WriteOutcome,
} from "@/components/device-ui/runtime/controlRuntime";

/** Prepare human consent before reserving the runtime's in-flight write slot. */
function useAttributePreparation(deviceId: string): AttributeWriter {
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
        if (!preview.eligible && !preview.consent_required)
          return { kind: "error", message: commandReasons(preview.reasons) };
        const language = i18n?.language || "en";
        if (preview.warnings?.length)
          toast.warning(commandReasons(preview.warnings));
        const prepared: PreparedSend = {
          kind: "send",
          send: async () => {
            try {
              await client.devices.sendCommand(deviceId, {
                attribute,
                value,
                confirm: true,
                ...(preview.user_confirmation || preview.consent_required
                  ? {
                      ui_confirmation_token: preview.confirmation_token,
                      confirmation_language: language,
                      ...(preview.consent_required
                        ? { acknowledge_unknown_operating_rules: true }
                        : {}),
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
          },
        };
        if (!preview.user_confirmation && !preview.consent_required)
          return prepared;
        if (!preview.confirmation_token) return { kind: "error", message: "" };
        return {
          kind: "confirm",
          confirm: async () => {
            const accepted = await requestConfirmation({
              attribute,
              value,
              preview,
              language,
              signal,
              trigger,
            });
            return accepted && !signal.aborted
              ? prepared
              : { kind: "cancelled" };
          },
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
export function useAttributeWriter(deviceId: string) {
  const runtime = useAttributeCommandRuntime(deviceId);
  return useCallback(
    (
      attribute: string,
      value: string | number | boolean,
    ): Promise<WriteOutcome> => {
      const state = runtime.snapshot(attribute);
      if (state.pending || state.confirming || state.write.kind === "sending")
        return Promise.resolve({ kind: "cancelled" });
      return runtime.request(attribute, value, { immediate: true });
    },
    [runtime],
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
        (attribute, value, signal) =>
          prepareRef.current(attribute, value, signal),
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

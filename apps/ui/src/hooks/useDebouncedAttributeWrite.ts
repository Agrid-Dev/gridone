import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deviceAttributes } from "@/lib/devices";
import type { Device } from "@gridone/sdk";
import { toast } from "sonner";
import { useAttributeCommandRuntime } from "./useAttributeCommandRuntime";

type DraftValue = string | number | boolean | null;
type Options = {
  deviceId: string;
  onDraftChange: (name: string, value: DraftValue) => void;
  delay?: number;
};

export function useDebouncedAttributeWrite({
  deviceId,
  onDraftChange,
  delay = 600,
}: Options) {
  const { t } = useTranslation("devices");
  const runtime = useAttributeCommandRuntime(deviceId, delay);
  const queryClient = useQueryClient();
  const observed = queryClient.getQueryData<Device>(["device", deviceId]);
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const [name, attribute] of Object.entries(
      observed ? deviceAttributes(observed) : {},
    )) {
      runtime.setReported(
        name,
        typeof attribute.current_value === "number" ||
          typeof attribute.current_value === "boolean" ||
          typeof attribute.current_value === "string"
          ? attribute.current_value
          : null,
      );
    }
  }, [runtime, observed]);
  useEffect(() => {
    for (const name of requested.current) {
      const state = runtime.snapshot(name);
      if (state.pending || state.preparing || state.write.kind === "sending")
        continue;
      requested.current.delete(name);
      onDraftChange(name, state.reported);
      if (state.write.kind === "error" || state.write.kind === "unconfirmed")
        toast.error(state.write.message || t("deviceDetails.updateFailed"));
      if (state.write.kind === "confirmed")
        toast.success(
          t("controls.thermostat.attributeUpdated", {
            name,
            value: String(state.write.requested),
          }),
        );
    }
  }, [runtime, runtime.version, onDraftChange, t]);
  const request = useCallback(
    (name: string, value: DraftValue, immediate: boolean) => {
      if (value === null || runtime.snapshot(name).preparing) return;
      requested.current.add(name);
      onDraftChange(name, value);
      runtime.request(name, value, { immediate });
    },
    [runtime, onDraftChange],
  );
  const changeAndSave = useCallback(
    (name: string, value: DraftValue) => request(name, value, false),
    [request],
  );
  const changeAndSaveNow = useCallback(
    (name: string, value: DraftValue) => request(name, value, true),
    [request],
  );
  const isSaving = useCallback(
    (name: string) => {
      const state = runtime.snapshot(name);
      return (
        state.pending || !!state.preparing || state.write.kind === "sending"
      );
    },
    [runtime, runtime.version],
  );
  return { changeAndSave, changeAndSaveNow, isSaving };
}

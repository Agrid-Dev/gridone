import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isGridoneError, type Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

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
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  // Cleanup all timers on unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const save = useCallback(
    async (name: string, value: DraftValue) => {
      setSaving((prev) => new Set(prev).add(name));
      try {
        // Attribute writes go through the commands endpoint; refetch the
        // device to surface the applied value.
        await client.devices.sendCommand(deviceId, {
          attribute: name,
          value: value as string | number | boolean,
        });
        const updated = await client.devices.get(deviceId);
        queryClient.setQueryData<Device>(["device", deviceId], updated);
        toast.success(
          t("controls.thermostat.attributeUpdated", {
            name,
            value: String(value ?? "—"),
          }),
        );
      } catch (err) {
        const message = isGridoneError(err)
          ? err.detail || err.message
          : err instanceof Error
            ? err.message
            : t("deviceDetails.updateFailed");
        toast.error(message);
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      }
    },
    [client, deviceId, queryClient, t],
  );

  const changeAndSave = useCallback(
    (name: string, value: DraftValue) => {
      onDraftChange(name, value);

      const existing = timers.current.get(name);
      if (existing) clearTimeout(existing);

      timers.current.set(
        name,
        setTimeout(() => {
          timers.current.delete(name);
          save(name, value);
        }, delay),
      );
    },
    [onDraftChange, save, delay],
  );

  const changeAndSaveNow = useCallback(
    (name: string, value: DraftValue) => {
      onDraftChange(name, value);

      const existing = timers.current.get(name);
      if (existing) {
        clearTimeout(existing);
        timers.current.delete(name);
      }

      save(name, value);
    },
    [onDraftChange, save],
  );

  const isSaving = useCallback((name: string) => saving.has(name), [saving]);

  return { changeAndSave, changeAndSaveNow, isSaving };
}

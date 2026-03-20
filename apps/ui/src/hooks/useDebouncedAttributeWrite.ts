import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { updateDeviceAttribute } from "@/api/devices";
import { isApiError } from "@/api/apiError";
import type { Device } from "@/api/devices";

type DraftValue = string | number | boolean | null;

type Options = {
  deviceId: string;
  draft: Record<string, DraftValue>;
  onDraftChange: (name: string, value: DraftValue) => void;
  delay?: number;
};

export function useDebouncedAttributeWrite({
  deviceId,
  draft,
  onDraftChange,
  delay = 600,
}: Options) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Cleanup all timers on unmount
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const save = useCallback(
    async (name: string, value: DraftValue, previousValue: DraftValue) => {
      setSaving((prev) => new Set(prev).add(name));
      try {
        const updated = await updateDeviceAttribute(deviceId, name, value);
        queryClient.setQueryData<Device>(["device", deviceId], updated);
        toast.success(
          t("thermostat.attributeUpdated", {
            name,
            previous: String(previousValue ?? "—"),
            current: String(value ?? "—"),
          }),
        );
      } catch (err) {
        const message = isApiError(err)
          ? err.details || err.message
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
    [deviceId, queryClient, t],
  );

  const changeAndSave = useCallback(
    (name: string, value: DraftValue) => {
      const previousValue = draftRef.current[name];
      onDraftChange(name, value);

      const existing = timers.current.get(name);
      if (existing) clearTimeout(existing);

      timers.current.set(
        name,
        setTimeout(() => {
          timers.current.delete(name);
          save(name, value, previousValue);
        }, delay),
      );
    },
    [onDraftChange, save, delay],
  );

  const changeAndSaveNow = useCallback(
    (name: string, value: DraftValue) => {
      const previousValue = draftRef.current[name];
      onDraftChange(name, value);

      const existing = timers.current.get(name);
      if (existing) {
        clearTimeout(existing);
        timers.current.delete(name);
      }

      save(name, value, previousValue);
    },
    [onDraftChange, save],
  );

  const isSaving = useCallback((name: string) => saving.has(name), [saving]);

  return { changeAndSave, changeAndSaveNow, isSaving };
}

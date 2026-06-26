import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/AuthContext";
import { ApiError } from "@/api/apiError";
import { updateDevice, type Device } from "@/api/devices";
import { useEditingSection } from "@/hooks/useEditingSection";

/** The editable categories on the device config page. */
export type ConfigSection = "identity" | "driverTransport" | "config";

/** Per-category inline edit controller for the device config page. Mirrors
 *  `useAutomationEdit`: only one section edits at a time (tracked in the URL),
 *  and each Save persists just that section's fields via a partial
 *  `PATCH /devices/:id`. On error the card stays in edit mode. */
export function useDeviceConfigEdit(device: Device) {
  const can = usePermissions();
  const canWrite = can("devices:write");
  const queryClient = useQueryClient();
  const { t } = useTranslation("devices");
  const { editingSection, setEditingSection } = useEditingSection();
  const [submittingSection, setSubmittingSection] =
    useState<ConfigSection | null>(null);

  const { mutate } = useMutation({
    mutationFn: (payload: Partial<Device>) => updateDevice(device.id, payload),
    onSuccess: () => {
      // The device page reads `["device", id]` (singular); the lists/cards read
      // `["devices", ...]`. Invalidate both so the new values show without a
      // navigation away.
      queryClient.invalidateQueries({ queryKey: ["device", device.id] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      toast.success(t("devices.feedback.updated"));
      setEditingSection(null);
    },
    onError: (err: Error) => {
      const detail =
        err instanceof ApiError ? err.details || err.message : err.message;
      toast.error(`${t("devices.feedback.updateError")}: ${detail}`);
    },
    onSettled: () => setSubmittingSection(null),
  });

  const update = (section: ConfigSection, payload: Partial<Device>) => {
    setSubmittingSection(section);
    mutate(payload);
  };

  return {
    canWrite,
    editingSection,
    setEditingSection,
    submittingSection,
    update,
  };
}

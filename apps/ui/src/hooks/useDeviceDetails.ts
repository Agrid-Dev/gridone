import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateDeviceAttribute } from "../api/devices";
import { useDevice } from "./useDevice";

export type Feedback = { type: "success" | "error"; message: string };

export function useDeviceDetails(deviceId: string | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const {
    data: device,
    isLoading: loading,
    error: queryError,
  } = useDevice(deviceId);

  const [draft, setDraft] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [savingAttr, setSavingAttr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Initialize draft when device loads
  useEffect(() => {
    if (device) {
      setDraft(
        Object.fromEntries(
          Object.entries(device.attributes).map(([name, attribute]) => [
            name,
            attribute.current_value,
          ]),
        ),
      );
    }
  }, [device]);

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t("deviceDetails.unableToLoad")
    : null;

  const handleDraftChange = (
    name: string,
    value: string | number | boolean | null,
  ) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (name: string) => {
    if (!device || savingAttr) return;
    const attribute = device.attributes[name];
    const value = draft[name];
    if (!attribute) return;

    setSavingAttr(name);
    setFeedback(null);

    try {
      const parsedValue =
        attribute.dataType === "bool"
          ? Boolean(value)
          : attribute.dataType === "int" || attribute.dataType === "float"
            ? Number(value)
            : value;
      const updated = await updateDeviceAttribute(device.id, name, parsedValue);

      // Update the query cache with the new device data
      queryClient.setQueryData(["device", deviceId], updated);

      // Update draft with new values
      setDraft((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(updated.attributes).map(([k, attr]) => [
            k,
            attr.current_value,
          ]),
        ),
      }));
      setFeedback({
        type: "success",
        message: t("deviceDetails.updated", { name }),
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : t("deviceDetails.updateFailed"),
      });
    } finally {
      setSavingAttr(null);
    }
  };

  return {
    device,
    loading,
    error,
    draft,
    savingAttr,
    feedback,
    handleDraftChange,
    handleSave,
  };
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateDeviceAttribute } from "../api/devices";
import { useDeviceFromRoute } from "./useDevice";

export type Feedback = { type: "success" | "error"; message: string };

export function useDeviceDetails() {
  const { t } = useTranslation("devices");
  const queryClient = useQueryClient();
  const device = useDeviceFromRoute();
  const deviceId = device.id;

  const [draft, setDraft] = useState<
    Record<string, string | number | boolean | null>
  >({});
  const [savingAttr, setSavingAttr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // Initialize draft when device loads
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        Object.entries(device.attributes).map(([name, attribute]) => [
          name,
          attribute.currentValue,
        ]),
      ),
    );
  }, [device]);

  const handleDraftChange = (
    name: string,
    value: string | number | boolean | null,
  ) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (name: string) => {
    if (savingAttr) return;
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
            attr.currentValue,
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
    draft,
    savingAttr,
    feedback,
    handleDraftChange,
    handleSave,
  };
}

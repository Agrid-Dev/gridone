import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import { useAttributeWriter } from "./useAttributeCommandRuntime";
import { deviceAttributes } from "@/lib/devices";
import type { AttributeFields } from "@/lib/faults";

export type Feedback = { type: "success" | "error"; message: string };

export function useDeviceDetails(device: Device) {
  const { t } = useTranslation("devices");
  const writer = useAttributeWriter(device.id);
  const queryClient = useQueryClient();
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
        Object.entries(deviceAttributes(device)).map(([name, attribute]) => [
          name,
          (attribute as AttributeFields).current_value,
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
    const attribute = deviceAttributes(device)[name] as
      | AttributeFields
      | undefined;
    const value = draft[name];
    if (!attribute) return;

    setSavingAttr(name);
    setFeedback(null);

    try {
      const parsedValue =
        attribute.data_type === "bool"
          ? Boolean(value)
          : attribute.data_type === "int" || attribute.data_type === "float"
            ? Number(value)
            : value;
      // Attribute writes go through the commands endpoint; refetch the device
      // to surface the applied value.
      const outcome = await writer(
        name,
        parsedValue as string | number | boolean,
      );
      if (outcome.kind === "cancelled") {
        handleDraftChange(name, attribute.current_value);
        return;
      }
      if (outcome.kind !== "ok") throw new Error(outcome.message);
      const updated =
        queryClient.getQueryData<Device>(["device", deviceId]) ?? device;

      // Update the query cache with the new device data
      queryClient.setQueryData(["device", deviceId], updated);

      // Update draft with new values
      setDraft((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(deviceAttributes(updated)).map(([k, attr]) => [
            k,
            (attr as AttributeFields).current_value,
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

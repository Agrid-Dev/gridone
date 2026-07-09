import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { deviceAttributes } from "@/lib/devices";
import type { AttributeFields } from "@/lib/faults";
import { useDeviceFromRoute } from "./useDevice";

export type Feedback = { type: "success" | "error"; message: string };

export function useDeviceDetails() {
  const { t } = useTranslation("devices");
  const client = useGridoneClient();
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
      await client.devices.sendCommand(device.id, {
        attribute: name,
        value: parsedValue as string | number | boolean,
      });
      const updated = await client.devices.get(device.id);

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

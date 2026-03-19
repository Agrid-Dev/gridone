import type { Device } from "@/api/devices";
import type { Feedback } from "@/hooks/useDeviceDetails";

/** Props passed to every standard device preview (card content slot). */
export type StandardPreviewProps = {
  device: Device;
};

/** Props passed to every standard device control (detail view). */
export type StandardControlProps = {
  device: Device;
  draft: Record<string, string | number | boolean | null>;
  savingAttr: string | null;
  feedback: Feedback | null;
  onDraftChange: (
    name: string,
    value: string | number | boolean | null,
  ) => void;
  onSave: (name: string) => void;
};

import { useEffect, useState } from "react";
import type { SlotValue } from "@gridone/sdk";
import type { AttributeTarget } from "@/components/forms/targetPicker/AttributeTargetPicker";

type Draft = {
  base: SlotValue | undefined;
  deviceId: string | undefined;
  target: AttributeTarget;
};

/** Stage a source choice until it has an attribute. The stored binding stays
 *  intact, including through a save, and external changes (undo or a device
 *  switch) discard the draft instead of applying it to a different reading. */
export function useSlotDraft(
  value: SlotValue | undefined,
  deviceId: string | undefined,
  onChange: (value: SlotValue | undefined) => void,
) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const current =
    draft?.base === value && draft?.deviceId === deviceId ? draft : null;
  useEffect(() => {
    setDraft((d) =>
      d && (d.base !== value || d.deviceId !== deviceId) ? null : d,
    );
  }, [value, deviceId]);
  const cancel = () => setDraft(null);
  const start = () =>
    setDraft({ base: value, deviceId, target: { devices: {} } });
  const pick = (target: AttributeTarget) => {
    if (!target.attribute?.trim()) {
      setDraft({ base: value, deviceId, target });
      return;
    }
    cancel();
    onChange({
      ...(value?.kind === "attribute" ? value : {}),
      kind: "attribute",
      target: { ...target, attribute: target.attribute },
    });
  };
  return { target: current?.target ?? null, start, cancel, pick };
}

import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { getStandardDeviceEntry } from "../standard-devices/registry";
import { DeviceAttributePanes } from "./DeviceAttributePanes";

export default function DeviceLiveControl() {
  const { device, draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails();

  const standardEntry = getStandardDeviceEntry(device.type);

  return (
    <div className="space-y-8">
      {/* ── Standard control (if registered) ── */}
      {standardEntry && (
        <div className="py-2">
          <standardEntry.Control
            device={device}
            draft={draft}
            savingAttr={savingAttr}
            feedback={feedback}
            onDraftChange={handleDraftChange}
            onSave={handleSave}
          />
        </div>
      )}

      {/* ── Read-only attribute panes: Standard · Faults · Internal ── */}
      <DeviceAttributePanes device={device} />
    </div>
  );
}

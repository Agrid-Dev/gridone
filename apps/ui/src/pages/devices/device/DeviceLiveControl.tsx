import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { getStandardDeviceEntry } from "../standard-devices/registry";
import { DeviceAttributePanes } from "./DeviceAttributePanes";

export default function DeviceLiveControl() {
  const device = useDeviceFromRoute();
  const { draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(device);

  const standardEntry = getStandardDeviceEntry(device.type);
  // A type with a full supervision layout renders it; others get their bare
  // control, centred as before.
  const StandardView = standardEntry?.Supervision ?? standardEntry?.Control;

  return (
    <div className="space-y-8">
      {/* ── Standard control (if registered) ── */}
      {StandardView && (
        <div className="py-2">
          <StandardView
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

import type { Device } from "@gridone/sdk";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { getStandardDeviceEntry } from "../standard-devices/registry";
import { DeviceAttributePanes } from "./DeviceAttributePanes";

/** The standard control surface of one device: its registered standard control
 *  (if any) over the read-only attribute panes. Takes the device explicitly so
 *  it can render outside the device route (e.g. in a dashboard widget). */
export function DeviceControlSurface({ device }: { device: Device }) {
  const { draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(device);

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

export default function DeviceLiveControl() {
  const device = useDeviceFromRoute();
  return <DeviceControlSurface device={device} />;
}

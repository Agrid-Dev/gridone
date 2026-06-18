import { useParams } from "react-router";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  // The device frame (DeviceLayout) owns the device crumb; this tab adds its
  // own segment. Called unconditionally to keep hook order stable.
  useBreadcrumb(
    deviceId
      ? [
          {
            to: `/devices/${deviceId}/commands`,
            labelKey: "breadcrumb.commands",
          },
        ]
      : [],
  );
  // A missing :deviceId is a route-config bug, not a 404 — escalate to the
  // enclosing DeviceLayout ResourceBoundary (→ generic error fallback).
  if (!deviceId) {
    throw new Error("DeviceCommandsPage requires a 'deviceId' route param");
  }
  // The device frame already renders the device header and tab bar, so we
  // suppress the default CommandsPage header; the New command action lives on
  // the filter bar.
  return <CommandsPage deviceId={deviceId} header={<></>} />;
}

import { useParams } from "react-router";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  // A missing :deviceId is a route-config bug, not a 404 — escalate to the
  // enclosing DeviceHistoryLayout ResourceBoundary (→ generic error fallback).
  if (!deviceId) {
    throw new Error("DeviceCommandsPage requires a 'deviceId' route param");
  }
  // The outer DeviceHistoryLayout already renders the page header and tab bar,
  // so we suppress the default CommandsPage header here with an empty node.
  return <CommandsPage deviceId={deviceId} header={<></>} />;
}

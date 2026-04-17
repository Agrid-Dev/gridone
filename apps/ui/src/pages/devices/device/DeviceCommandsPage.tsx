import { useParams } from "react-router";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  if (!deviceId) return <NotFoundFallback />;
  // The outer DeviceHistoryLayout already renders the page header and tab bar,
  // so we suppress the default CommandsPage header here with an empty node.
  return <CommandsPage deviceId={deviceId} header={<></>} />;
}

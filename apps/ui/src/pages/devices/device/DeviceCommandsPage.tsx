import { useTranslation } from "react-i18next";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { isReadOnlyDevice } from "@/lib/devices";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { t } = useTranslation("devices");
  const device = useDeviceFromRoute();

  // Read-only devices (e.g. a weather sensor) can't be commanded. Keep the tab
  // reachable but explain why it's empty rather than disabling the nav item.
  if (isReadOnlyDevice(device)) {
    return (
      <ResourceEmpty
        resourceName={t("commands.title")}
        showCreate={false}
        title={t("commands.readOnlyTitle")}
        description={t("commands.readOnlyDescription")}
      />
    );
  }

  // The device frame already renders the device header — with its own "send a
  // command" action — and the tab bar, so the page drops both here.
  return <CommandsPage deviceId={device.id} embedded />;
}

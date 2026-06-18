import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { isReadOnlyDevice } from "@/api/devices";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { t } = useTranslation("devices");
  const device = useDeviceFromRoute();

  useBreadcrumb([
    { to: `/devices/${device.id}/commands`, labelKey: "breadcrumb.commands" },
  ]);

  // Read-only devices (e.g. a weather sensor) can't be commanded. Keep the tab
  // reachable but explain why it's empty rather than disabling the nav item.
  if (isReadOnlyDevice(device)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Terminal />
          </EmptyMedia>
          <EmptyTitle>{t("commands.readOnlyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("commands.readOnlyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // The device frame already renders the device header and tab bar, so we
  // suppress the default CommandsPage header; the New command action lives on
  // the filter bar.
  return <CommandsPage deviceId={device.id} header={<></>} />;
}

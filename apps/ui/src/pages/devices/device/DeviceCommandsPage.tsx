import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { usePermissions } from "@/contexts/AuthContext";
import CommandsPage from "@/pages/devices/commands/CommandsPage";

export default function DeviceCommandsPage() {
  const { t } = useTranslation("devices");
  const can = usePermissions();
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

  // The device frame already renders the device header and tab bar; this tab
  // owns the "New command" action, so we pass it in place of the default
  // CommandsPage header.
  const header = can("devices:write") ? (
    <div className="flex justify-end">
      <Button asChild size="sm">
        <Link to={`/devices/${deviceId}/commands/new`}>
          <Terminal className="h-3.5 w-3.5" />
          {t("commands.newCommand")}
        </Link>
      </Button>
    </div>
  ) : (
    <></>
  );

  return <CommandsPage deviceId={deviceId} header={header} />;
}

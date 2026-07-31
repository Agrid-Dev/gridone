import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  isNotFound,
  type Device,
  type DeviceControlWidgetConfig,
} from "@gridone/sdk";
import { ConnectionStatusDot } from "@/components/ConnectionStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeviceById } from "@/hooks/useDeviceById";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";
import { getConnectionStatus } from "@/lib/devices";
import { getStandardDeviceEntry } from "@/pages/devices/standard-devices/registry";

/** Centred one-liner for the states the control itself has no rendering for. */
const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/** The device's registered standard control, wired to the same draft/command
 *  path as the device page. Split out so the write-state hooks only mount once
 *  the device is resolved. */
const StandardControl: FC<{ device: Device }> = ({ device }) => {
  const { t } = useTranslation("dashboards");
  const { draft, savingAttr, feedback, handleDraftChange, handleSave } =
    useDeviceDetails(device);

  // The picker only offers types with a standard control, but a device
  // re-driven since the save can drift out of that set — named rather than
  // rendered empty.
  const entry = getStandardDeviceEntry(device.type);
  if (!entry) return <Message>{t("widgets.deviceControl.noControl")}</Message>;

  return (
    <entry.Control
      device={device}
      draft={draft}
      savingAttr={savingAttr}
      feedback={feedback}
      onDraftChange={handleDraftChange}
      onSave={handleSave}
    />
  );
};

/**
 * Embeds the standard control of one device — the same control the device
 * page renders, writes included, under the same permissions. The read-only
 * attribute panes stay on the device page; the widget is the control alone.
 *
 * Live-only by design: values arrive over the WebSocket (which feeds the
 * `["device", id]` cache this widget reads), so the dashboard period is never
 * consulted — the view deliberately does not call `useDashboardPeriod`. The
 * device is fetched by id at render time; one deleted since the widget was
 * saved renders an explicit error state while the widget itself stays
 * editable and removable.
 */
export const DeviceControlWidgetView: FC<{ config: unknown }> = ({
  config,
}) => {
  const { device_id: deviceId } = config as DeviceControlWidgetConfig;
  const { t } = useTranslation("dashboards");
  const result = useDeviceById(deviceId || undefined);

  if (!deviceId) return <Message>{t("widgets.deviceControl.empty")}</Message>;
  if (result.isLoading) {
    return (
      <div className="h-full p-3">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  if (result.error || !result.data) {
    if (isNotFound(result.error))
      return <Message>{t("widgets.deviceControl.notFound")}</Message>;
    return <Message>{t("widgets.deviceControl.error")}</Message>;
  }

  const device = result.data;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <Link
          to={`/devices/${device.id}`}
          className="truncate text-xs font-medium text-foreground hover:underline"
        >
          {device.name}
        </Link>
        {/* Fixed "live" label — the dot alone carries the connection status. */}
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <ConnectionStatusDot
            status={getConnectionStatus(device)}
            className="animate-pulse"
          />
          {t("widgets.deviceControl.live")}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <StandardControl device={device} />
      </div>
    </div>
  );
};

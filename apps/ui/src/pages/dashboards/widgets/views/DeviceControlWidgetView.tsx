import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import type { DeviceControlWidgetConfig } from "@gridone/sdk";
import {
  ConnectionStatusDot,
  ConnectionStatusValue,
} from "@/components/ConnectionStatusBadge";
import { useDeviceById } from "@/hooks/useDeviceById";
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { getConnectionStatus } from "@/lib/devices";
import {
  ControlMessage,
  StandardDeviceControlBody,
} from "@/pages/devices/standard-devices/StandardDeviceControl";

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
  const canSeeConnectionStatus = useCanSeeConnectionStatus();

  if (!deviceId)
    return <ControlMessage>{t("widgets.deviceControl.empty")}</ControlMessage>;

  const device = result.data;
  return (
    <div className="flex h-full flex-col">
      {device && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <Link
            to={`/devices/${device.id}`}
            className="truncate text-xs font-medium text-primary hover:underline focus-visible:underline"
          >
            {device.name || device.id}
          </Link>

          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {canSeeConnectionStatus && (
              <>
                <ConnectionStatusDot status={getConnectionStatus(device)} />
                <ConnectionStatusValue status={getConnectionStatus(device)} />
              </>
            )}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <StandardDeviceControlBody result={result} />
      </div>
    </div>
  );
};

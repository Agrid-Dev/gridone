import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { isNotFound, type DeviceControlWidgetConfig } from "@gridone/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeviceById } from "@/hooks/useDeviceById";
import { DeviceControlSurface } from "@/pages/devices/device/DeviceLiveControl";

/** Centred one-liner for the states the surface itself has no rendering for. */
const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/**
 * Embeds the standard control surface of one device — the same one the device
 * page renders, writes included, under the same permissions.
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
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          {t("widgets.deviceControl.live")}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <DeviceControlSurface device={device} />
      </div>
    </div>
  );
};

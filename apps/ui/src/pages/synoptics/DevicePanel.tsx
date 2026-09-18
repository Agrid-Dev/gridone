import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeviceById } from "@/hooks/useDeviceById";
import { StandardDeviceControlBody } from "@/pages/devices/standard-devices/StandardDeviceControl";

/** The device a symbol is, beside the plate: its standard control, the
 *  same one the device page and the dashboard widget render. A flat
 *  cutaway dropped into an isometric plant room reads wrong, so it opens
 *  here rather than on the plate. */
export const DevicePanel: FC<{ deviceId: string; onClose: () => void }> = ({
  deviceId,
  onClose,
}) => {
  const { t } = useTranslation("synoptics");
  const result = useDeviceById(deviceId);
  const device = result.data;

  return (
    <aside
      className="flex w-96 shrink-0 flex-col rounded-lg border border-border bg-card"
      aria-label={t("panel.label")}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {device ? (
          <Link
            to={`/devices/${device.id}`}
            className="flex min-w-0 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:underline"
          >
            <span className="truncate">{device.name}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        ) : (
          <span className="truncate text-sm text-muted-foreground">
            {deviceId}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label={t("panel.close")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <StandardDeviceControlBody result={result} />
      </div>
    </aside>
  );
};

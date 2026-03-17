import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardContent } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Device } from "@/api/devices";
import {
  getLastUpdateTime,
  formatTimeAgo,
  getUpdateStatusColor,
} from "@/lib/utils";
import { Link } from "react-router";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";

function UpdateDot({ attributes }: { attributes: Device["attributes"] }) {
  const { t } = useTranslation();
  const lastUpdateTime = getLastUpdateTime(attributes);

  const [, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lastUpdateTime) return;
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [lastUpdateTime]);

  if (!lastUpdateTime) return null;

  const statusColor = getUpdateStatusColor(lastUpdateTime);
  const isRecent = Date.now() - lastUpdateTime < 5 * 60 * 1000;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative flex h-2 w-2 flex-shrink-0">
          {isRecent && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${statusColor.dot}`}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {t("common.lastUpdate")} {formatTimeAgo(lastUpdateTime, t)}
      </TooltipContent>
    </Tooltip>
  );
}

export function DeviceCard({ device }: { device: Device }) {
  const { t } = useTranslation();

  const configEntries = Object.entries(device.config ?? {});

  return (
    <Link to={`/devices/${device.id}`} className="group block h-full">
      <Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-1.5">
            <UpdateDot attributes={device.attributes} />
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground truncate">
              {device.driverId}
            </p>
          </div>
          <h2 className="mt-1 text-lg font-semibold text-card-foreground truncate">
            {device.name || device.id}
          </h2>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <DeviceTypeChip type={device.type} />
          <Badge variant="outline">
            {Object.keys(device.attributes).length} {t("common.attributes")}
          </Badge>
          {configEntries.length > 0 && (
            <span className="text-xs text-muted-foreground truncate">
              {configEntries.map(([key, value], i) => (
                <span key={key}>
                  {i > 0 && " \u00b7 "}
                  <span className="font-medium">{key}</span>: {String(value)}
                </span>
              ))}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

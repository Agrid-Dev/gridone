import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui";
import { Device, DeviceAttribute } from "@/api/devices";
import {
  formatAttributeValue,
  getLastUpdateTime,
  formatTimeAgo,
  getUpdateStatusColor,
} from "@/lib/utils";
import { Link } from "react-router-dom";

const metricOrder = [
  "temperature",
  "humidity",
  "brightness",
  "wind_speed",
  "battery",
];

function selectMetrics(attributes: Record<string, DeviceAttribute>) {
  return metricOrder
    .map((key) => ({ key, value: attributes[key] }))
    .filter(({ value }) => value && value.current_value !== null);
}

export function DeviceCard({ device }: { device: Device }) {
  const { t } = useTranslation();
  const metrics = selectMetrics(device.attributes);
  const lastUpdateTime = getLastUpdateTime(device.attributes);
  
  // Force re-render every minute to update the time display
  const [, setNow] = useState(Date.now());
  
  useEffect(() => {
    if (!lastUpdateTime) return;
    
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, [lastUpdateTime]);
  
  const statusColor = getUpdateStatusColor(lastUpdateTime);
  const isRecent = lastUpdateTime && Date.now() - lastUpdateTime < 5 * 60 * 1000;

  return (
    <Link to={`/devices/${device.id}`} className="group block h-full">
      <Card className="relative h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
        <CardHeader className="relative">
          {lastUpdateTime && (
            <span
              className={`absolute top-4 right-4 inline-flex items-center gap-1 rounded-full ${statusColor.bg} px-2 py-0.5 text-[10px] font-medium ${statusColor.text} border ${statusColor.border} flex-shrink-0 whitespace-nowrap z-10`}
            >
              {isRecent && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${statusColor.dot}`}></span>
                </span>
              )}
              {!isRecent && (
                <span className={`inline-flex h-1.5 w-1.5 rounded-full ${statusColor.dot}`}></span>
              )}
              {t("common.lastUpdate")} {formatTimeAgo(lastUpdateTime, t)}
            </span>
          )}
          <div className="flex-1 min-w-0 pr-20">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground truncate">
              {device.driver}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-card-foreground truncate">
              {device.id}
            </h2>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground break-words">
            {device.config && Object.keys(device.config).length
              ? Object.entries(device.config)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")
              : t("common.noConfiguration")}
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {metrics.length ? (
            metrics.map((metric) => (
              <span
                key={metric.key}
                className="rounded-md bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground break-words max-w-full"
              >
                {metric.key}:{" "}
                {formatAttributeValue(metric.value?.current_value)}
              </span>
            ))
          ) : (
            <span className="rounded-md bg-muted px-2.5 py-1 text-sm text-muted-foreground break-words">
              {t("common.noLiveMetrics")}
            </span>
          )}
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground whitespace-nowrap">
            {Object.keys(device.attributes).length} {t("common.attributes")}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

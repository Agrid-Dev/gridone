import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui";
import { Device, DeviceAttribute } from "../api/devices";
import {
  formatAttributeValue,
  getLastUpdateTime,
  formatTimeAgo,
  getUpdateStatusColor,
} from "../lib/utils";
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
        {lastUpdateTime && (
          <span
            className={`absolute top-2 right-2 inline-flex items-center gap-1 rounded-full ${statusColor.bg} px-2 py-0.5 text-[10px] font-medium ${statusColor.text} border ${statusColor.border} flex-shrink-0 whitespace-nowrap z-10`}
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
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500 truncate">
                {device.driver}
              </p>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 truncate">
              {device.id}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600 break-words">
          {device.config && Object.keys(device.config).length
            ? Object.entries(device.config)
                .map(([key, value]) => `${key}: ${value}`)
                .join(" · ")
            : t("common.noConfiguration")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          {metrics.length ? (
            metrics.map((metric) => (
              <span
                key={metric.key}
                className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700 break-words max-w-full"
              >
                {metric.key}:{" "}
                {formatAttributeValue(metric.value?.current_value)}
              </span>
            ))
          ) : (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-600 break-words">
              {t("common.noLiveMetrics")}
            </span>
          )}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 whitespace-nowrap">
            {Object.keys(device.attributes).length} {t("common.attributes")}
          </span>
        </div>
      </Card>
    </Link>
  );
}

import { useTranslation } from "react-i18next";
import { Card } from "../components/ui";
import { Device, DeviceAttribute } from "../api/devices";
import { formatAttributeValue } from "../lib/utils";
import { Link } from "react-router-dom";

const metricOrder = [
  "temperature",
  "humidity",
  "brightness",
  "wind_speed",
  "battery",
];

// Threshold for "recently updated" - 5 minutes in milliseconds
const RECENT_UPDATE_THRESHOLD = 5 * 60 * 1000;

function selectMetrics(attributes: Record<string, DeviceAttribute>) {
  return metricOrder
    .map((key) => ({ key, value: attributes[key] }))
    .filter(({ value }) => value && value.current_value !== null);
}

function isDeviceRecentlyUpdated(device: Device): boolean {
  const now = Date.now();

  // Check if any attribute was updated recently
  for (const attribute of Object.values(device.attributes)) {
    if (attribute.last_updated) {
      const updatedTime = new Date(attribute.last_updated).getTime();
      const timeSinceUpdate = now - updatedTime;

      if (timeSinceUpdate >= 0 && timeSinceUpdate <= RECENT_UPDATE_THRESHOLD) {
        return true;
      }
    }
  }

  return false;
}

export function DeviceCard({ device }: { device: Device }) {
  const { t } = useTranslation();
  const metrics = selectMetrics(device.attributes);
  const recentlyUpdated = isDeviceRecentlyUpdated(device);

  return (
    <Link to={`/devices/${device.id}`} className="group block h-full">
      <Card className="h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-slate-500">
                {device.driver}
              </p>
              {recentlyUpdated && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  </span>
                  {t("common.recentlyUpdated")}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {device.id}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600">
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
                className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700"
              >
                {metric.key}:{" "}
                {formatAttributeValue(metric.value?.current_value)}
              </span>
            ))
          ) : (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-600">
              {t("common.noLiveMetrics")}
            </span>
          )}
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {Object.keys(device.attributes).length} {t("common.attributes")}
          </span>
        </div>
      </Card>
    </Link>
  );
}

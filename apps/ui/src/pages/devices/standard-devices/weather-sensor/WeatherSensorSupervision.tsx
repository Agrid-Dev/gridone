import type { LucideIcon } from "lucide-react";
import { Droplets, Navigation2, Wind } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { isWeatherSensor, readWeatherSensorAttributes } from "@/lib/devices";
import type { StandardControlProps } from "../types";
import { degreesToCompass, type CompassDirection } from "./compass";
import { WeatherDial } from "./WeatherDial";
import { WeatherTemperatureHistory } from "./WeatherTemperatureHistory";

type WeatherMetricProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix?: string;
  progress: number | null;
  progressMax: number;
  barClassName: string;
};

const COMPASS_KEYS: Record<CompassDirection, string> = {
  N: "N",
  NE: "NE",
  E: "E",
  SE: "SE",
  S: "S",
  SW: "SW",
  W: "W",
  NW: "NW",
};

function clampProgress(value: number | null, max: number) {
  if (value == null) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function formatNumber(value: number | null, locale: string) {
  return value == null
    ? "—"
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function WeatherMetric({
  icon: Icon,
  label,
  value,
  suffix,
  progress,
  progressMax,
  barClassName,
}: WeatherMetricProps) {
  return (
    <div className="min-w-0 p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="mt-3 flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span className="font-mono text-3xl font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </span>
        {suffix && (
          <span className="truncate text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={progressMax}
        aria-valuenow={progress ?? undefined}
      >
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${clampProgress(progress, progressMax)}%` }}
        />
      </div>
    </div>
  );
}

/** Full-width weather supervision composition matching the conditions-first
 *  layout: dial on the left, current KPIs and the 24-hour trend on the right. */
export function WeatherSensorSupervision({ device }: StandardControlProps) {
  const { t, i18n } = useTranslation("devices");
  if (!isWeatherSensor(device)) return null;

  const attributes = readWeatherSensorAttributes(device);
  const direction = degreesToCompass(attributes.windDirection);
  const compass = direction
    ? t(
        `controls.weatherSensor.compass.${COMPASS_KEYS[direction]}` as "controls.weatherSensor.compass.N",
      )
    : null;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const directionSuffix = compass ? `° · ${compass}` : "°";

  return (
    <Card className="overflow-hidden">
      <div className="grid xl:grid-cols-2">
        <section className="flex min-h-[31rem] min-w-0 flex-col p-6 sm:p-8">
          <h3 className="text-xl font-semibold">
            {t("controls.weatherSensor.conditions")}
          </h3>
          <div className="flex flex-1 items-center justify-center py-4">
            <WeatherDial
              temperature={attributes.temperature}
              windSpeed={attributes.windSpeed}
              windDirection={attributes.windDirection}
              compass={compass}
              outdoorLabel={t("controls.weatherSensor.outdoor")}
              locale={locale}
            />
          </div>
        </section>

        <div className="min-w-0 border-t xl:border-l xl:border-t-0">
          <div className="grid border-b sm:grid-cols-3 sm:divide-x">
            <WeatherMetric
              icon={Droplets}
              label={t("controls.weatherSensor.humidity")}
              value={formatNumber(attributes.humidity, locale)}
              suffix="%"
              progress={attributes.humidity}
              progressMax={100}
              barClassName="bg-sky-500"
            />
            <WeatherMetric
              icon={Wind}
              label={t("controls.weatherSensor.wind")}
              value={formatNumber(attributes.windSpeed, locale)}
              suffix="km/h"
              progress={attributes.windSpeed}
              progressMax={50}
              barClassName="bg-primary"
            />
            <WeatherMetric
              icon={Navigation2}
              label={t("controls.weatherSensor.direction")}
              value={formatNumber(attributes.windDirection, locale)}
              suffix={directionSuffix}
              progress={attributes.windDirection}
              progressMax={360}
              barClassName="bg-muted-foreground"
            />
          </div>
          <WeatherTemperatureHistory deviceId={device.id} />
        </div>
      </div>
    </Card>
  );
}

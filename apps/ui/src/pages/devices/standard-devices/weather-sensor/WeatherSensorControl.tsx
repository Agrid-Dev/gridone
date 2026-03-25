import { useTranslation } from "react-i18next";
import { Thermometer, Wind, Droplets, Navigation } from "lucide-react";
import { isWeatherSensor, readWeatherSensorAttributes } from "@/api/devices";
import { getWeatherCode } from "./weatherCodes";
import { degreesToCompass } from "./compass";
import type { StandardControlProps } from "../types";

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}

export function WeatherSensorControl({ device }: StandardControlProps) {
  const { t } = useTranslation();

  if (!isWeatherSensor(device)) return null;
  const a = readWeatherSensorAttributes(device);
  const weather = getWeatherCode(a.weatherCode);
  const WeatherIcon = weather.icon;

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-6 shadow-md">
      {/* Header: weather icon + label */}
      <div className="mb-5 flex flex-col items-center gap-1">
        <WeatherIcon className="h-10 w-10 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{weather.label}</span>
      </div>

      {/* Temperature — prominent */}
      <div className="mb-6 flex items-center justify-center gap-2">
        <Thermometer className="h-5 w-5 text-muted-foreground" />
        <span className="text-4xl font-light tabular-nums">
          {fmt(a.temperature)}°C
        </span>
      </div>

      {/* Grid: wind + humidity */}
      <div className="grid grid-cols-2 gap-4">
        {/* Wind */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border bg-muted/30 p-4">
          <Wind className="h-5 w-5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("weatherSensor.wind")}
          </span>
          <span className="text-lg font-medium tabular-nums">
            {fmt(a.windSpeed, 0)}{" "}
            <span className="text-xs text-muted-foreground">km/h</span>
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Navigation
              className="h-3 w-3"
              style={{
                transform: `rotate(${(a.windDirection ?? 0) + 180}deg)`,
              }}
            />
            <span className="font-medium">
              {degreesToCompass(a.windDirection)}
            </span>
            <span className="tabular-nums">({a.windDirection ?? "—"}°)</span>
          </div>
        </div>

        {/* Humidity */}
        <div className="flex flex-col items-center gap-1.5 rounded-xl border bg-muted/30 p-4">
          <Droplets className="h-5 w-5 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("weatherSensor.humidity")}
          </span>
          <span className="text-lg font-medium tabular-nums">
            {fmt(a.humidity, 0)}
            <span className="text-xs text-muted-foreground"> %</span>
          </span>
        </div>
      </div>
    </div>
  );
}

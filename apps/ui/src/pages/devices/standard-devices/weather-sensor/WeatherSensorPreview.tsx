import { Wind, Navigation } from "lucide-react";
import { isWeatherSensor, readWeatherSensorAttributes } from "@/api/devices";
import { getWeatherCode } from "./weatherCodes";
import { degreesToCompass } from "./compass";
import type { StandardPreviewProps } from "../types";

export function WeatherSensorPreview({ device }: StandardPreviewProps) {
  if (!isWeatherSensor(device)) return null;
  const a = readWeatherSensorAttributes(device);
  const weather = getWeatherCode(a.weatherCode);
  const WeatherIcon = weather.icon;

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Temperature + weather icon */}
      <div className="flex items-center gap-2 min-w-0">
        <WeatherIcon className="h-5 w-5 text-muted-foreground" />
        <span className="text-2xl font-light tabular-nums leading-none">
          {a.temperature != null ? Number(a.temperature).toFixed(1) : "—"}°
        </span>
      </div>

      {/* Wind */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Wind className="h-3 w-3" />
        <span className="tabular-nums">
          {a.windSpeed != null ? `${Number(a.windSpeed).toFixed(0)} km/h` : "—"}
        </span>
        <Navigation
          className="h-2.5 w-2.5"
          style={{ transform: `rotate(${(a.windDirection ?? 0) + 180}deg)` }}
        />
        <span>{degreesToCompass(a.windDirection)}</span>
      </div>
    </div>
  );
}

import { Wind, Navigation2 } from "lucide-react";
import { isWeatherSensor, readWeatherSensorAttributes } from "@/api/devices";
import { getWeatherCode } from "./weatherCodes";
import { degreesToCompass } from "./compass";
import type { StandardPreviewProps } from "../types";

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}

export function WeatherSensorPreview({ device }: StandardPreviewProps) {
  if (!isWeatherSensor(device)) return null;
  const a = readWeatherSensorAttributes(device);
  const weather = getWeatherCode(a.weatherCode);
  const WeatherIcon = weather.icon;
  const compass = degreesToCompass(a.windDirection);

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Temperature + weather icon */}
      <div className="flex items-center gap-2 min-w-0">
        <WeatherIcon className="h-5 w-5 text-muted-foreground" />
        <span className="font-mono text-2xl font-light tabular-nums leading-none">
          {fmt(a.temperature)}°
        </span>
      </div>

      {/* Wind */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Wind className="h-3 w-3" />
        <span className="tabular-nums">
          {a.windSpeed != null ? `${fmt(a.windSpeed, 0)} km/h` : "—"}
        </span>
        {compass && (
          <>
            <Navigation2
              className="h-2.5 w-2.5"
              style={{
                transform: `rotate(${a.windDirection}deg)`,
              }}
            />
            <span>{compass}</span>
          </>
        )}
      </div>
    </div>
  );
}

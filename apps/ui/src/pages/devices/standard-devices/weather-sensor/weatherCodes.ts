import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Snowflake,
  CloudHail,
} from "lucide-react";

type WeatherCodeEntry = {
  icon: LucideIcon;
  label: string;
};

/**
 * Maps WMO weather interpretation codes (0–99) to a Lucide icon and
 * an English label.
 *
 * Reference: https://open-meteo.com/en/docs#weathervariables
 * Codes not listed fall back to the `Cloud` icon with "Unknown".
 */
const WEATHER_CODES: Record<number, WeatherCodeEntry> = {
  0: { icon: Sun, label: "Clear sky" },
  1: { icon: CloudSun, label: "Mainly clear" },
  2: { icon: CloudSun, label: "Partly cloudy" },
  3: { icon: Cloud, label: "Overcast" },
  45: { icon: CloudFog, label: "Fog" },
  48: { icon: CloudFog, label: "Depositing rime fog" },
  51: { icon: CloudDrizzle, label: "Light drizzle" },
  53: { icon: CloudDrizzle, label: "Moderate drizzle" },
  55: { icon: CloudDrizzle, label: "Dense drizzle" },
  56: { icon: CloudDrizzle, label: "Light freezing drizzle" },
  57: { icon: CloudDrizzle, label: "Dense freezing drizzle" },
  61: { icon: CloudRain, label: "Slight rain" },
  63: { icon: CloudRain, label: "Moderate rain" },
  65: { icon: CloudRain, label: "Heavy rain" },
  66: { icon: CloudRain, label: "Light freezing rain" },
  67: { icon: CloudRain, label: "Heavy freezing rain" },
  71: { icon: CloudSnow, label: "Slight snowfall" },
  73: { icon: CloudSnow, label: "Moderate snowfall" },
  75: { icon: CloudSnow, label: "Heavy snowfall" },
  77: { icon: Snowflake, label: "Snow grains" },
  80: { icon: CloudRain, label: "Slight rain showers" },
  81: { icon: CloudRain, label: "Moderate rain showers" },
  82: { icon: CloudRain, label: "Violent rain showers" },
  85: { icon: CloudSnow, label: "Slight snow showers" },
  86: { icon: CloudSnow, label: "Heavy snow showers" },
  95: { icon: CloudLightning, label: "Thunderstorm" },
  96: { icon: CloudHail, label: "Thunderstorm with slight hail" },
  99: { icon: CloudHail, label: "Thunderstorm with heavy hail" },
};

const FALLBACK: WeatherCodeEntry = { icon: Cloud, label: "Unknown" };

export function getWeatherCode(code: number | null): WeatherCodeEntry {
  if (code == null) return FALLBACK;
  return WEATHER_CODES[code] ?? FALLBACK;
}

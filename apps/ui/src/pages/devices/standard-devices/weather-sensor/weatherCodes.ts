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
  labelKey: string;
};

/**
 * Maps WMO weather interpretation codes (0–99) to a Lucide icon and
 * a translation key (under the `devices:weatherCodes` namespace).
 *
 * Reference: https://open-meteo.com/en/docs#weathervariables
 * Codes not listed fall back to the `Cloud` icon with "unknown".
 */
const WEATHER_CODES: Record<number, WeatherCodeEntry> = {
  0: { icon: Sun, labelKey: "clearSky" },
  1: { icon: CloudSun, labelKey: "mainlyClear" },
  2: { icon: CloudSun, labelKey: "partlyCloudy" },
  3: { icon: Cloud, labelKey: "overcast" },
  45: { icon: CloudFog, labelKey: "fog" },
  48: { icon: CloudFog, labelKey: "depositingRimeFog" },
  51: { icon: CloudDrizzle, labelKey: "lightDrizzle" },
  53: { icon: CloudDrizzle, labelKey: "moderateDrizzle" },
  55: { icon: CloudDrizzle, labelKey: "denseDrizzle" },
  56: { icon: CloudDrizzle, labelKey: "lightFreezingDrizzle" },
  57: { icon: CloudDrizzle, labelKey: "denseFreezingDrizzle" },
  61: { icon: CloudRain, labelKey: "slightRain" },
  63: { icon: CloudRain, labelKey: "moderateRain" },
  65: { icon: CloudRain, labelKey: "heavyRain" },
  66: { icon: CloudRain, labelKey: "lightFreezingRain" },
  67: { icon: CloudRain, labelKey: "heavyFreezingRain" },
  71: { icon: CloudSnow, labelKey: "slightSnowfall" },
  73: { icon: CloudSnow, labelKey: "moderateSnowfall" },
  75: { icon: CloudSnow, labelKey: "heavySnowfall" },
  77: { icon: Snowflake, labelKey: "snowGrains" },
  80: { icon: CloudRain, labelKey: "slightRainShowers" },
  81: { icon: CloudRain, labelKey: "moderateRainShowers" },
  82: { icon: CloudRain, labelKey: "violentRainShowers" },
  85: { icon: CloudSnow, labelKey: "slightSnowShowers" },
  86: { icon: CloudSnow, labelKey: "heavySnowShowers" },
  95: { icon: CloudLightning, labelKey: "thunderstorm" },
  96: { icon: CloudHail, labelKey: "thunderstormSlightHail" },
  99: { icon: CloudHail, labelKey: "thunderstormHeavyHail" },
};

const FALLBACK: WeatherCodeEntry = { icon: Cloud, labelKey: "unknown" };

export function getWeatherCode(code: number | null): WeatherCodeEntry {
  if (code == null) return FALLBACK;
  return WEATHER_CODES[code] ?? FALLBACK;
}

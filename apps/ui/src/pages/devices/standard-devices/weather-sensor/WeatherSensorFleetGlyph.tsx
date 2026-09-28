import {
  CloudDrizzle,
  CloudHail,
  CloudRain,
  CloudSnow,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { isWeatherSensor, readWeatherSensorAttributes } from "@/lib/devices";
import { GlyphFrame, useGlyphLabel } from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";
import { getWeatherCode } from "./weatherCodes";

/** Skies worth a tint: sun warm, precipitation in the water tone. */
const WEATHER_TONE = new Map<LucideIcon, string>([
  [Sun, "text-hvac-heat"],
  [CloudDrizzle, "text-water"],
  [CloudRain, "text-water"],
  [CloudSnow, "text-water"],
  [CloudHail, "text-water"],
]);

/** Weather sensor: the current sky itself (the `weatherCodes` mapping), so the
 *  glyph is both the type and the reading. */
export function WeatherSensorFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const code = isWeatherSensor(device)
    ? readWeatherSensorAttributes(device).weatherCode
    : null;
  const { icon: Icon } = getWeatherCode(code);
  const known = code != null;

  return (
    <GlyphFrame label={label} state={known ? `code:${code}` : "unknown"}>
      <Icon
        x={6}
        y={6}
        width={36}
        height={36}
        strokeWidth={1.5}
        strokeDasharray={known ? undefined : "2 2"}
        className={
          known
            ? (WEATHER_TONE.get(Icon) ?? "text-foreground")
            : "text-muted-foreground"
        }
      />
    </GlyphFrame>
  );
}

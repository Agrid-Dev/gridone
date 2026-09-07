import { useMemo, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Shapes,
  Thermometer,
  TriangleAlert,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hslToCss,
  temperatureHsl,
  TEMP_COMFORT_C,
  TEMP_COOL_C,
  TEMP_HEAT_C,
} from "./temperature";
import {
  FUNCTION_LEGEND,
  type ColorMode,
  type ViewerTheme,
} from "./themeColors";

const MODES: { mode: ColorMode; Icon: LucideIcon }[] = [
  { mode: "temperature", Icon: Thermometer },
  { mode: "function", Icon: Shapes },
  { mode: "alerts", Icon: TriangleAlert },
  { mode: "connectivity", Icon: Wifi },
];

/** Gradient samples between the cool and heat bounds, inclusive. */
const STOPS = 7;

const SWATCH = "h-2 w-2 shrink-0 rounded-full";

/**
 * Colour-mode switcher plus a legend that follows the active mode.
 *
 * The temperature bar and the function grid are built from the very tables the
 * scene paints with (`temperatureHsl`, `FUNCTION_LEGEND`). The alert and
 * connectivity rows restate `zoneTriplet`'s two-and-three-way mappings against
 * the same theme tokens — few enough to read at a glance, but they are a copy,
 * so a new severity or connection state has to be added in both places.
 *
 * The function legend is filtered to the families actually present in the
 * building (`functionKeys`) so it stays short.
 *
 * The key itself is folded away by default: it answers a question asked once
 * ("what does this colour mean?"), while the mode buttons above it are reached
 * over and over. Unfolding is remembered for as long as the viewer is open.
 */
export const ColorModeControl: FC<{
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
  theme: ViewerTheme;
  functionKeys: string[];
}> = ({ mode, onChange, theme, functionKeys }) => {
  const { t } = useTranslation("home");
  const [legendOpen, setLegendOpen] = useState(false);

  const gradient = useMemo(() => {
    const stops = Array.from({ length: STOPS }, (_, index) => {
      const ratio = index / (STOPS - 1);
      const tempC = TEMP_COOL_C + (TEMP_HEAT_C - TEMP_COOL_C) * ratio;
      const color = temperatureHsl(tempC, theme.cool, theme.ok, theme.heat);
      return `${hslToCss(color)} ${Math.round(ratio * 100)}%`;
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }, [theme]);

  const presentFunctions = useMemo(() => {
    const present = new Set(functionKeys);
    return FUNCTION_LEGEND.filter((family) => present.has(family.key));
  }, [functionKeys]);

  return (
    <div className="pointer-events-auto hidden select-none rounded-lg border border-border bg-card/90 p-2 shadow-sm backdrop-blur sm:block">
      <div
        className="mb-2 flex gap-0.5"
        role="radiogroup"
        aria-label={t("zonesByLevel.viewer.colorBy")}
      >
        {MODES.map(({ mode: value, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onChange(value)}
            title={t(`zonesByLevel.viewer.colorMode.${value}`)}
            aria-label={t(`zonesByLevel.viewer.colorMode.${value}`)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              mode === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        ))}
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setLegendOpen((open) => !open)}
        aria-expanded={legendOpen}
        aria-label={t(
          legendOpen
            ? "zonesByLevel.viewer.legendHide"
            : "zonesByLevel.viewer.legendShow",
        )}
      >
        <span className="truncate">
          {t(`zonesByLevel.viewer.colorMode.${mode}`)}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform duration-200",
            legendOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {legendOpen && (
        <div className="mt-1.5">
          {mode === "temperature" && (
            <div className="w-28">
              <div
                className="h-1.5 w-full rounded-full"
                style={{ background: gradient }}
                aria-hidden
              />
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>{TEMP_COOL_C}°</span>
                <span>{TEMP_COMFORT_C}°</span>
                <span>{TEMP_HEAT_C}°</span>
              </div>
            </div>
          )}

          {mode === "function" && (
            <ul className="grid max-w-[13rem] grid-cols-2 gap-x-2 gap-y-1">
              {presentFunctions.map((family) => (
                <li key={family.key} className="flex items-center gap-1.5">
                  <span
                    className={SWATCH}
                    style={{ background: hslToCss(family.color) }}
                    aria-hidden
                  />
                  <span className="truncate text-[10px] text-muted-foreground">
                    {t(`zonesByLevel.viewer.functionFamily.${family.key}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {mode === "alerts" && (
            <ul className="space-y-1">
              {(
                [
                  ["alert", theme.error],
                  ["warning", theme.heat],
                ] as const
              ).map(([key, color]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    className={SWATCH}
                    style={{ background: hslToCss(color) }}
                    aria-hidden
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {t(`zonesByLevel.viewer.alertsLegend.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {mode === "connectivity" && (
            <ul className="space-y-1">
              {(
                [
                  ["ok", theme.ok],
                  ["degraded", theme.heat],
                  ["error", theme.error],
                ] as const
              ).map(([key, color]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    className={SWATCH}
                    style={{ background: hslToCss(color) }}
                    aria-hidden
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {t(`zonesByLevel.viewer.connectivityLegend.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

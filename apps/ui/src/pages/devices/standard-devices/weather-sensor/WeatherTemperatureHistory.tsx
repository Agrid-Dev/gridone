import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { useWeatherTemperatureHistory } from "./useWeatherTemperatureHistory";

type ChartPoint = { x: number; y: number };

const CHART_WIDTH = 720;
const CHART_HEIGHT = 190;
const CHART_PADDING_X = 2;
const CHART_PADDING_Y = 22;

/** Project sparse, timestamped temperatures into a compact SVG line path.
 *  Null readings are omitted; real timestamps determine horizontal spacing. */
export function temperaturePath(
  timestamps: Date[],
  temperatures: (number | null)[],
): string {
  const readings = temperatures.flatMap((value, index) =>
    value == null || !timestamps[index]
      ? []
      : [{ timestamp: timestamps[index].getTime(), value }],
  );
  if (readings.length === 0) return "";

  const minTime = readings[0].timestamp;
  const maxTime = readings[readings.length - 1].timestamp;
  const minValue = Math.min(...readings.map(({ value }) => value));
  const maxValue = Math.max(...readings.map(({ value }) => value));
  const timeSpan = Math.max(maxTime - minTime, 1);
  const valueSpan = Math.max(maxValue - minValue, 1);
  const points: ChartPoint[] = readings.map(({ timestamp, value }) => ({
    x:
      CHART_PADDING_X +
      ((timestamp - minTime) / timeSpan) * (CHART_WIDTH - CHART_PADDING_X * 2),
    y:
      CHART_HEIGHT -
      CHART_PADDING_Y -
      ((value - minValue) / valueSpan) * (CHART_HEIGHT - CHART_PADDING_Y * 2),
  }));

  return points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
}

function formatTemperature(value: number | null, locale: string) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)} °C`;
}

/** Minimal 24-hour temperature plot used by the weather supervision card. */
export function WeatherTemperatureHistory({ deviceId }: { deviceId: string }) {
  const { t, i18n } = useTranslation("devices");
  const { timestamps, temperatures, min, max, isLoading, hasData } =
    useWeatherTemperatureHistory(deviceId);
  const path = temperaturePath(timestamps, temperatures);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <section className="flex min-h-[19rem] flex-col p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <h3 className="text-base font-semibold">
          {t("controls.weatherSensor.temperatureLast24h")}
        </h3>
        {hasData && (
          <p className="text-xs text-muted-foreground sm:text-sm">
            {t("controls.weatherSensor.min", {
              value: formatTemperature(min, locale),
            })}
            <span aria-hidden="true"> · </span>
            {t("controls.weatherSensor.max", {
              value: formatTemperature(max, locale),
            })}
          </p>
        )}
      </div>

      <div className="mt-5 flex min-h-0 flex-1 items-center">
        {isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : !hasData ? (
          <p className="flex h-52 w-full items-center justify-center text-sm text-muted-foreground">
            {t("controls.weatherSensor.noTemperatureHistory")}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-52 w-full overflow-visible"
            role="img"
            aria-label={t("controls.weatherSensor.temperatureChartLabel")}
          >
            {[0.18, 0.5, 0.82].map((position) => (
              <line
                key={position}
                x1="0"
                x2={CHART_WIDTH}
                y1={CHART_HEIGHT * position}
                y2={CHART_HEIGHT * position}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={path}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </section>
  );
}

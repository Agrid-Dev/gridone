import { Wind } from "lucide-react";

type WeatherDialProps = {
  temperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  compass: string | null;
  outdoorLabel: string;
  locale: string;
};

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 140;
const TICKS = 20;

type Point = { x: number; y: number };

/** Convert meteorological degrees (0° at north, clockwise) to an SVG point. */
function pointOnDial(degrees: number, radius: number): Point {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

/** Describe the short highlighted arc centred on the current wind direction. */
function directionArc(direction: number): string {
  const start = pointOnDial(direction - 17, RADIUS);
  const end = pointOnDial(direction + 17, RADIUS);
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

function formatNumber(value: number | null, digits: number, locale: string) {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Read-only outdoor conditions gauge. The blue arc and arrow locate the
 *  incoming wind around the dial while the centre keeps the temperature as
 *  the primary reading. */
export function WeatherDial({
  temperature,
  windSpeed,
  windDirection,
  compass,
  outdoorLabel,
  locale,
}: WeatherDialProps) {
  const normalizedDirection =
    windDirection == null ? null : ((windDirection % 360) + 360) % 360;
  const arrow =
    normalizedDirection == null
      ? null
      : pointOnDial(normalizedDirection, RADIUS - 27);

  return (
    <div className="relative aspect-square w-full max-w-[21rem]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="7"
          opacity="0.65"
        />
        {Array.from({ length: TICKS }, (_, index) => (
          <line
            key={index}
            x1={CENTER}
            y1="20"
            x2={CENTER}
            y2={index % 5 === 0 ? 39 : 33}
            transform={`rotate(${(360 / TICKS) * index} ${CENTER} ${CENTER})`}
            stroke="hsl(var(--border))"
            strokeWidth={index % 5 === 0 ? 3 : 2}
            strokeLinecap="round"
            opacity="0.75"
          />
        ))}
        {normalizedDirection != null && (
          <>
            <path
              d={directionArc(normalizedDirection)}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {arrow && (
              <polygon
                points={`${arrow.x},${arrow.y - 12} ${arrow.x + 9},${arrow.y + 9} ${arrow.x},${arrow.y + 5} ${arrow.x - 9},${arrow.y + 9}`}
                transform={`rotate(${normalizedDirection + 180} ${arrow.x} ${arrow.y})`}
                fill="hsl(var(--primary))"
              />
            )}
          </>
        )}
      </svg>

      <div className="absolute inset-[16%] flex flex-col items-center justify-center text-center">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground sm:text-sm">
          {outdoorLabel}
        </span>
        <div className="mt-1 font-mono text-6xl font-light leading-none tracking-tight tabular-nums sm:text-7xl">
          {formatNumber(temperature, 1, locale)}
          <span className="ml-1 align-top text-2xl text-muted-foreground sm:text-3xl">
            °
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground sm:text-base">
          <Wind className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium tabular-nums text-foreground">
            {formatNumber(windSpeed, 0, locale)}
          </span>
          <span>km/h</span>
          {compass && <span>{compass}</span>}
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

type ThermostatDialProps = {
  setpoint: number | null;
  currentTemp: number | null;
  min: number | null;
  max: number | null;
  saving: boolean;
};

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 110;
const STROKE = 8;

// Open arc: 270° sweep starting at 7 o'clock (135°), ending at 5 o'clock (405° = 45° + 360°).
// We work in math convention (0° = east, CCW), but for the dial we use 0° = 7 o'clock.
const START_ANGLE_DEG = 135; // 7 o'clock in screen coords (Y flipped)
const SWEEP_DEG = 270;

function polar(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function describeArc(startDeg: number, endDeg: number): string {
  const start = polar(startDeg);
  const end = polar(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function ThermostatDial({
  setpoint,
  currentTemp,
  min,
  max,
  saving,
}: ThermostatDialProps) {
  const hasRange = min != null && max != null && max > min;
  const fraction =
    hasRange && currentTemp != null
      ? Math.max(0, Math.min(1, (currentTemp - min) / (max - min)))
      : null;

  const railPath = describeArc(START_ANGLE_DEG, START_ANGLE_DEG + SWEEP_DEG);
  const fillEnd =
    fraction != null ? START_ANGLE_DEG + fraction * SWEEP_DEG : START_ANGLE_DEG;
  const fillPath =
    fraction != null && fraction > 0
      ? describeArc(START_ANGLE_DEG, fillEnd)
      : null;
  const dot = fraction != null ? polar(fillEnd) : null;

  const startPos = polar(START_ANGLE_DEG);
  const endPos = polar(START_ANGLE_DEG + SWEEP_DEG);

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden
      >
        <path
          d={railPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke="hsl(var(--primary) / 0.6)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        )}
        {dot && (
          <circle
            cx={dot.x}
            cy={dot.y}
            r={STROKE * 1.2}
            fill="hsl(var(--primary))"
          />
        )}
        {hasRange && (
          <>
            <text
              x={startPos.x}
              y={startPos.y + 24}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 13 }}
            >
              {min}°
            </text>
            <text
              x={endPos.x}
              y={endPos.y + 24}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 13 }}
            >
              {max}°
            </text>
          </>
        )}
      </svg>

      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center",
          saving && "animate-pulse",
        )}
      >
        <div className="flex items-start gap-0.5">
          <span className="font-display text-6xl font-light tabular-nums leading-none text-foreground">
            {setpoint != null ? Number(setpoint).toFixed(1) : "—"}
          </span>
          <span className="mt-1 text-lg font-light leading-none text-muted-foreground">
            °
          </span>
        </div>
      </div>
    </div>
  );
}

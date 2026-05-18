import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";

type ThermostatDialProps = {
  setpoint: number | null;
  currentTemp: number | null;
  min: number | null;
  max: number | null;
  saving: boolean;
  step?: number;
  onSetpointChange?: (value: number) => void;
};

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 110;
const STROKE = 8;

// Open arc: 270° sweep starting at 7 o'clock (135°), ending at 5 o'clock (405° = 45° + 360°).
const START_ANGLE_DEG = 135;
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

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Convert a pointer position (in SVG coordinates) to a fraction along the
 * dial sweep [0, 1]. Inputs in the bottom gap snap to the nearer end.
 */
function pointerToFraction(svgX: number, svgY: number): number {
  const dx = svgX - CX;
  const dy = svgY - CY;
  const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const a360 = (rawDeg + 360) % 360;
  const delta = (a360 - START_ANGLE_DEG + 360) % 360;
  if (delta <= SWEEP_DEG) return delta / SWEEP_DEG;
  const distToEnd = delta - SWEEP_DEG;
  const distToStart = 360 - delta;
  return distToEnd <= distToStart ? 1 : 0;
}

export function ThermostatDial({
  setpoint,
  currentTemp,
  min,
  max,
  saving,
  step = 0.5,
  onSetpointChange,
}: ThermostatDialProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hasRange = min != null && max != null && max > min;
  const interactive = hasRange && onSetpointChange != null;

  const setpointFraction =
    hasRange && setpoint != null
      ? Math.max(0, Math.min(1, (setpoint - min) / (max - min)))
      : null;

  const currentFraction =
    hasRange && currentTemp != null
      ? Math.max(0, Math.min(1, (currentTemp - min) / (max - min)))
      : null;

  const railPath = describeArc(START_ANGLE_DEG, START_ANGLE_DEG + SWEEP_DEG);
  const fillEnd =
    setpointFraction != null
      ? START_ANGLE_DEG + setpointFraction * SWEEP_DEG
      : START_ANGLE_DEG;
  const fillPath =
    setpointFraction != null && setpointFraction > 0
      ? describeArc(START_ANGLE_DEG, fillEnd)
      : null;
  const dot = setpointFraction != null ? polar(fillEnd) : null;
  const tick =
    currentFraction != null
      ? polar(START_ANGLE_DEG + currentFraction * SWEEP_DEG)
      : null;

  const startPos = polar(START_ANGLE_DEG);
  const endPos = polar(START_ANGLE_DEG + SWEEP_DEG);

  const commitPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg || !hasRange || !onSetpointChange) return;
      const rect = svg.getBoundingClientRect();
      // Map client coords to SVG viewBox coords (rect could be scaled).
      const svgX = ((clientX - rect.left) / rect.width) * SIZE;
      const svgY = ((clientY - rect.top) / rect.height) * SIZE;
      const fraction = pointerToFraction(svgX, svgY);
      const raw = min + fraction * (max - min);
      const snapped = Math.max(min, Math.min(max, snap(raw, step)));
      onSetpointChange(snapped);
    },
    [hasRange, max, min, onSetpointChange, step],
  );

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    commitPointer(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    commitPointer(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={cn(interactive && "touch-none cursor-pointer")}
        role={interactive ? "slider" : undefined}
        aria-valuemin={interactive ? min : undefined}
        aria-valuemax={interactive ? max : undefined}
        aria-valuenow={interactive && setpoint != null ? setpoint : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
        {tick && (
          <circle
            cx={tick.x}
            cy={tick.y}
            r={3}
            fill="hsl(var(--muted-foreground))"
          />
        )}
        {dot && (
          <circle
            cx={dot.x}
            cy={dot.y}
            r={STROKE * 1.5}
            fill="hsl(var(--primary))"
            stroke="hsl(var(--background))"
            strokeWidth={2}
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
          "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1",
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
        {currentTemp != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {Number(currentTemp).toFixed(1)}°
          </span>
        )}
      </div>
    </div>
  );
}

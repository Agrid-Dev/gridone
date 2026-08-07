import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DIAL_START_DEG,
  DIAL_SWEEP_DEG,
  arcPath,
  pointToValue,
  polarPoint,
  valueToAngle,
} from "./dialGeometry";

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 100;
const TRACK_WIDTH = 12;
const KNOB_RADIUS = 10;
const MEASURED_DOT_RADIUS = 4.5;
/** Grab area around the track, wide enough to catch an imprecise click
 *  without swallowing the reading at the centre of the dial. */
const HIT_WIDTH = 44;

type ThermostatDialProps = {
  /** Target temperature; null renders an empty track. */
  setpoint: number | null;
  /** Measured temperature marker on the track; null hides it. */
  measured: number | null;
  min: number;
  max: number;
  isOn: boolean;
  /** Mode text-colour class driving the progress arc and knob. */
  modeColorClass: string;
  saving: boolean;
  /** Called with each new setpoint as the user drags the knob, clicks the
   *  track, or presses an arrow key. Omit to keep the dial read-only. */
  onChange?: (value: number) => void;
  /** Granularity of the values `onChange` reports. */
  step?: number;
};

/** 270° arc gauge showing the setpoint (progress arc + knob) against the
 *  device's setpoint range, with the measured temperature as a dot on the
 *  track and the values overlaid in the centre.
 *
 *  With `onChange` the track becomes a slider: drag the knob, click anywhere
 *  on the ring, or use the arrow keys. The dial owns no value — it reports
 *  each new setpoint and re-renders from the one it is given, so the parent
 *  stays the single source of truth (and keeps the +/- steppers in sync). */
export function ThermostatDial({
  setpoint,
  measured,
  min,
  max,
  isOn,
  modeColorClass,
  saving,
  onChange,
  step = 0.5,
}: ThermostatDialProps) {
  const { t } = useTranslation("devices");
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const interactive = onChange != null && setpoint != null;

  /** Setpoint under the pointer, in the dial's own coordinate system: the
   *  SVG scales to its container, so client pixels are converted through the
   *  rendered size rather than assumed to be viewBox units. */
  const valueAt = (event: PointerEvent): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const scale = SIZE / rect.width;
    return pointToValue(
      (event.clientX - rect.left) * scale - CENTER,
      (event.clientY - rect.top) * scale - CENTER,
      min,
      max,
      step,
    );
  };

  const handlePointerDown = (event: PointerEvent<SVGPathElement>) => {
    if (!interactive || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    const value = valueAt(event);
    if (value != null) onChange?.(value);
  };

  const handlePointerMove = (event: PointerEvent<SVGPathElement>) => {
    if (!dragging) return;
    const value = valueAt(event);
    if (value != null) onChange?.(value);
  };

  const endDrag = (event: PointerEvent<SVGPathElement>) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || setpoint == null) return;
    const next = {
      ArrowUp: setpoint + step,
      ArrowRight: setpoint + step,
      ArrowDown: setpoint - step,
      ArrowLeft: setpoint - step,
      Home: min,
      End: max,
    }[event.key];
    if (next == null) return;
    event.preventDefault();
    onChange?.(Math.min(max, Math.max(min, next)));
  };

  const setpointAngle =
    setpoint != null ? valueToAngle(setpoint, min, max) : null;
  const measuredPoint =
    measured != null
      ? polarPoint(CENTER, CENTER, RADIUS, valueToAngle(measured, min, max))
      : null;
  const knobPoint =
    setpointAngle != null
      ? polarPoint(CENTER, CENTER, RADIUS, setpointAngle)
      : null;

  const trackPath = arcPath(
    CENTER,
    CENTER,
    RADIUS,
    DIAL_START_DEG,
    DIAL_START_DEG + DIAL_SWEEP_DEG,
  );

  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[15rem] rounded-full",
        interactive &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4",
      )}
      role={interactive ? "slider" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? t("controls.thermostat.setpoint") : undefined}
      aria-valuemin={interactive ? min : undefined}
      aria-valuemax={interactive ? max : undefined}
      aria-valuenow={interactive ? (setpoint ?? undefined) : undefined}
      onKeyDown={handleKeyDown}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-full w-full touch-none"
        aria-hidden
      >
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={TRACK_WIDTH}
          strokeLinecap="round"
        />
        {/* Progress arc + knob, tinted by the active mode */}
        <g
          className={cn(
            "transition-colors",
            isOn ? modeColorClass : "text-muted-foreground/50",
          )}
        >
          {setpointAngle != null && setpointAngle > DIAL_START_DEG && (
            <path
              d={arcPath(CENTER, CENTER, RADIUS, DIAL_START_DEG, setpointAngle)}
              fill="none"
              stroke="currentColor"
              strokeWidth={TRACK_WIDTH}
              strokeLinecap="round"
            />
          )}
          {knobPoint && (
            <circle
              cx={knobPoint.x}
              cy={knobPoint.y}
              r={KNOB_RADIUS}
              fill="hsl(var(--card))"
              stroke="currentColor"
              strokeWidth={4}
            />
          )}
        </g>
        {/* Measured temperature marker */}
        {measuredPoint && (
          <circle
            cx={measuredPoint.x}
            cy={measuredPoint.y}
            r={MEASURED_DOT_RADIUS}
            fill="hsl(var(--status-info))"
          />
        )}
        {/* Grab area: an invisible band over the track, hit-tested on its
            stroke so the centre reading stays untouchable and the cursor
            only changes where dragging actually does something. */}
        {interactive && (
          <path
            d={trackPath}
            data-testid="dial-track"
            fill="none"
            stroke="transparent"
            strokeWidth={HIT_WIDTH}
            strokeLinecap="round"
            style={{ pointerEvents: "stroke" }}
            className={dragging ? "cursor-grabbing" : "cursor-grab"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
      </svg>

      {/* Centre overlay — text only, and kept out of the way of the grab
          area it sits on top of. */}
      <div className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center gap-1">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {t("controls.thermostat.setpoint")}
        </span>
        <div
          className={cn("flex items-start", saving && "animate-pulse")}
          data-saving={saving || undefined}
        >
          <span
            className={cn(
              "text-6xl font-extralight tabular-nums leading-none transition-colors",
              !isOn && "text-muted-foreground",
            )}
          >
            {setpoint != null ? setpoint.toFixed(1) : "—"}
          </span>
          <span className="text-xl text-muted-foreground">°</span>
        </div>
        {measured != null && (
          <div className="mt-1 flex items-center gap-1.5 text-sm">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-status-info"
            />
            <span className="text-muted-foreground">
              {t("controls.thermostat.measured")}
            </span>
            <span className="font-medium tabular-nums">
              {measured.toFixed(1)} °C
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

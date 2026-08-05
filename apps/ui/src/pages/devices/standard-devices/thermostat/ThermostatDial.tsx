import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DIAL_START_DEG,
  DIAL_SWEEP_DEG,
  arcPath,
  polarPoint,
  valueToAngle,
} from "./dialGeometry";

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 100;
const TRACK_WIDTH = 12;
const KNOB_RADIUS = 10;
const MEASURED_DOT_RADIUS = 4.5;

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
};

/** 270° arc gauge showing the setpoint (progress arc + knob) against the
 *  device's setpoint range, with the measured temperature as a dot on the
 *  track and the values overlaid in the centre. Purely presentational —
 *  the parent owns range fallback and colour resolution. */
export function ThermostatDial({
  setpoint,
  measured,
  min,
  max,
  isOn,
  modeColorClass,
  saving,
}: ThermostatDialProps) {
  const { t } = useTranslation("devices");

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

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[15rem]">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-full w-full"
        aria-hidden
      >
        {/* Track */}
        <path
          d={arcPath(
            CENTER,
            CENTER,
            RADIUS,
            DIAL_START_DEG,
            DIAL_START_DEG + DIAL_SWEEP_DEG,
          )}
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
      </svg>

      {/* Centre overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
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

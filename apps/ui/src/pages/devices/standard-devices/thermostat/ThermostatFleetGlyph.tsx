import { PowerOff } from "lucide-react";
import { isThermostat, readThermostatAttributes } from "@/lib/devices";
import { HVAC_MODE_ICONS } from "@/lib/hvacModeIcons";
import {
  CornerBadge,
  DASH,
  GlyphFrame,
  liveTone,
  runState,
  useGlyphLabel,
} from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";

/** A thermostat drawn from its domain: a thermometer with a mode badge. The
 *  column level is fixed — bounds are not known, and the temperatures are the
 *  card's reading. On, the column and badge take the mode (icon + tint); off,
 *  the column empties and the badge turns to power-off; unreported, the
 *  outline is dashed and there is no badge. */
export function ThermostatFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const { onoffState, mode } = isThermostat(device)
    ? readThermostatAttributes(device)
    : { onoffState: null, mode: null };
  const run = runState(onoffState, mode);
  const on = run === "running";
  const tone = liveTone(run, mode, "text-foreground");
  const ModeIcon = mode ? HVAC_MODE_ICONS[mode] : undefined;
  const BadgeIcon = on ? ModeIcon : PowerOff;

  return (
    <GlyphFrame label={label} state={on && mode ? `running:${mode}` : run}>
      {/* Tube and bulb, one outline. */}
      <path
        d="M14 9 a5 5 0 0 1 10 0 V30.5 a8 8 0 1 1 -10 0 Z"
        strokeWidth={1.5}
        strokeDasharray={run === "unknown" ? DASH : undefined}
        className="fill-card stroke-border"
      />
      {[12, 17, 22].map((y) => (
        <line
          key={y}
          x1={26.5}
          y1={y}
          x2={29.5}
          y2={y}
          strokeWidth={1.25}
          strokeLinecap="round"
          className="stroke-muted-foreground"
        />
      ))}
      {run !== "unknown" && (
        <g className={on ? tone : "text-muted-foreground/50"}>
          <rect
            x={17}
            y={15}
            width={4}
            height={20}
            rx={2}
            fill="currentColor"
          />
          <circle cx={19} cy={37} r={5} fill="currentColor" />
        </g>
      )}
      {run !== "unknown" && BadgeIcon && (
        <CornerBadge
          icon={BadgeIcon}
          tone={on ? tone : "text-muted-foreground"}
        />
      )}
    </GlyphFrame>
  );
}

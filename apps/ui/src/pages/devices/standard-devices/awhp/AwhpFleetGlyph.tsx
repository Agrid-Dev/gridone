import { isAwhp, readAwhpAttributes } from "@/lib/devices";
import {
  Casing,
  Fan,
  GlyphFrame,
  liveTone,
  runState,
  useGlyphLabel,
} from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";

/** Air/water heat pump: the outdoor unit — wide box on feet, big fan grille on
 *  one side, louvred compressor panel on the other. */
export function AwhpFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const { onoffState, mode } = isAwhp(device)
    ? readAwhpAttributes(device)
    : { onoffState: null, mode: null };
  const run = runState(onoffState, mode);
  const tone = liveTone(run, mode);

  return (
    <GlyphFrame label={label} state={run}>
      {[7, 36].map((x) => (
        <rect
          key={x}
          x={x}
          y={37}
          width={5}
          height={4}
          rx={0.5}
          className="fill-border"
        />
      ))}
      <Casing
        x={2}
        y={9}
        width={44}
        height={29}
        rx={2.5}
        unknown={run === "unknown"}
      />
      <Fan cx={16} cy={23.5} r={10.5} tone={tone} running={run === "running"} />
      <circle
        cx={16}
        cy={23.5}
        r={7}
        fill="none"
        strokeWidth={0.75}
        className="stroke-border"
      />
      {[14, 18.5, 23, 27.5, 32].map((y) => (
        <line
          key={y}
          x1={31}
          y1={y}
          x2={42}
          y2={y}
          strokeWidth={1.25}
          strokeLinecap="round"
          className="stroke-muted-foreground"
        />
      ))}
    </GlyphFrame>
  );
}

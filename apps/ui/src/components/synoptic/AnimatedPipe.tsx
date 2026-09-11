import { roundedPath } from "./geometry";
import { Pipe } from "./Pipe";
import type { Pt } from "./types";

type AnimatedPipeProps = {
  points: Pt[];
  color: string;
  width?: number;
  radius?: number;
  endArrow?: boolean;
  /** When false the pipe renders static and dimmed (no flow). */
  flowing?: boolean;
  /** Dash travel speed multiplier. */
  speed?: number;
  dashColor?: string;
};

/**
 * Pipe with an animated dash overlay indicating live flow.
 * Requires the `scada-flow` keyframes defined in index.css.
 */
export function AnimatedPipe({
  points,
  color,
  width = 6,
  radius = 10,
  endArrow = false,
  flowing = true,
  speed = 1,
  dashColor = "rgba(255,255,255,0.75)",
}: AnimatedPipeProps) {
  return (
    <g opacity={flowing ? 1 : 0.45}>
      <Pipe
        points={points}
        color={color}
        width={width}
        radius={radius}
        endArrow={endArrow}
      />
      {flowing && (
        <path
          d={roundedPath(points, radius)}
          fill="none"
          stroke={dashColor}
          strokeWidth={Math.max(2, width * 0.38)}
          strokeDasharray="10 16"
          strokeLinecap="round"
          style={{ animation: `scada-flow ${1.2 / speed}s linear infinite` }}
        />
      )}
    </g>
  );
}

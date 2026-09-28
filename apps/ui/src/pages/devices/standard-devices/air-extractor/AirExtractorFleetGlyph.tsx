import { isAirExtractor, readAirExtractorAttributes } from "@/lib/devices";
import {
  Casing,
  Fan,
  Flow,
  GlyphFrame,
  liveTone,
  useGlyphLabel,
} from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";
import { extractorRunState } from "./fan";

/** Air extractor: a box fan with its discharge straight up — no coil, no
 *  second duct. */
export function AirExtractorFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const run = isAirExtractor(device)
    ? extractorRunState(readAirExtractorAttributes(device))
    : "unknown";
  const tone = liveTone(run, null);

  return (
    <GlyphFrame label={label} state={run}>
      <Casing
        x={8}
        y={13}
        width={32}
        height={30}
        rx={3}
        unknown={run === "unknown"}
      />
      <Fan cx={24} cy={28} r={11} tone={tone} running={run === "running"} />
      <line
        x1={24}
        y1={11}
        x2={24}
        y2={4}
        strokeWidth={1.5}
        strokeLinecap="round"
        className="stroke-muted-foreground"
      />
      <Flow x={24} y={3} dir="up" />
    </GlyphFrame>
  );
}

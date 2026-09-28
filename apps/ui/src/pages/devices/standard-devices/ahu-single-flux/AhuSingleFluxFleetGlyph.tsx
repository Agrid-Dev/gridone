import { isAhuSingleFlux, readAhuSingleFluxAttributes } from "@/lib/devices";
import {
  Casing,
  Coil,
  DuctStub,
  Fan,
  GlyphFrame,
  coilMode,
  liveTone,
  ModuleJoints,
  runState,
  useGlyphLabel,
} from "../glyph-kit";
import type { StandardFleetGlyphProps } from "../types";

/** Single-flow air handler: one duct line — filter, coil, fan modules — in a
 *  sectioned casing between two duct connections. */
export function AhuSingleFluxFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const { onoffState, hvacMode, heatingValve, coolingValve } = isAhuSingleFlux(
    device,
  )
    ? readAhuSingleFluxAttributes(device)
    : {
        onoffState: null,
        hvacMode: null,
        heatingValve: null,
        coolingValve: null,
      };
  const run = runState(onoffState, hvacMode);
  const running = run === "running";
  // The coil says which battery is driving the air (a shut coil is muted);
  // the fans only say running, in the neutral tone.
  const coil = coilMode(heatingValve, coolingValve, hvacMode);
  const coilTone = liveTone(run, coil, "text-muted-foreground");
  const fanTone = running ? "text-foreground" : "text-muted-foreground";

  return (
    <GlyphFrame label={label} state={running && coil ? `running:${coil}` : run}>
      <DuctStub x={8} y={24} side="left" dir="right" />
      <DuctStub x={40} y={24} side="right" dir="right" />
      <Casing
        x={8}
        y={12}
        width={32}
        height={24}
        rx={2.5}
        unknown={run === "unknown"}
      />
      <ModuleJoints xs={[18, 28]} y1={12} y2={36} />
      <polyline
        points="11,15 15,18 11,21 15,24 11,27 15,30 11,33"
        fill="none"
        strokeWidth={1.25}
        className="stroke-muted-foreground"
      />
      <Coil x={20} y={15} width={6} height={18} tone={coilTone} />
      <Fan cx={34} cy={24} r={4.5} tone={fanTone} running={running} />
    </GlyphFrame>
  );
}

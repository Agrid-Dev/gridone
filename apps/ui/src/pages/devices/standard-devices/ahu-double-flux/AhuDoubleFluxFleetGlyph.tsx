import { isAhuDoubleFlux, readAhuDoubleFluxAttributes } from "@/lib/devices";
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

/** Double-flow air handler: two stacked duct lines in a sectioned casing,
 *  four duct connections, the plate exchanger's X across both lines. Coil and
 *  fan on the supply (top, air to the right), fan on the extract. */
export function AhuDoubleFluxFleetGlyph({ device }: StandardFleetGlyphProps) {
  const label = useGlyphLabel(device);
  const { onoffState, hvacMode, heatingValve, coolingValve } = isAhuDoubleFlux(
    device,
  )
    ? readAhuDoubleFluxAttributes(device)
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
      <DuctStub x={8} y={15} side="left" dir="right" />
      <DuctStub x={40} y={15} side="right" dir="right" />
      <DuctStub x={8} y={33} side="left" dir="left" />
      <DuctStub x={40} y={33} side="right" dir="left" />
      <Casing
        x={8}
        y={5}
        width={32}
        height={38}
        rx={2.5}
        unknown={run === "unknown"}
      />
      <line
        x1={8}
        y1={24}
        x2={40}
        y2={24}
        strokeWidth={1.25}
        className="stroke-border"
      />
      <ModuleJoints xs={[19, 29]} y1={5} y2={43} />
      {/* Plate exchanger across both lines: the double-flow tell. */}
      <path
        d="M19.5 7 L28.5 41 M28.5 7 L19.5 41"
        strokeWidth={1.25}
        className="stroke-muted-foreground"
      />
      <Coil x={10.5} y={9} width={6} height={12} tone={coilTone} />
      <Fan cx={34.5} cy={15} r={4.5} tone={fanTone} running={running} />
      <Fan cx={13.5} cy={33} r={4.5} tone={fanTone} running={running} />
    </GlyphFrame>
  );
}

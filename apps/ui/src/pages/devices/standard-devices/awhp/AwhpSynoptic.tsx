import { useTranslation } from "react-i18next";
import type { Severity } from "@gridone/sdk";
import type { AwhpAttributes } from "@/lib/devices";
import { useReadingFormat } from "@/hooks/useReadingFormat";
import { fluidFillClass } from "@/lib/fluidColors";
import { cn } from "@/lib/utils";
import {
  Caption,
  Chip,
  CHIP_H,
  CHIP_LABEL_GAP,
  chipWidth,
  DISC_R,
} from "@/components/synoptic/Chip";
import {
  Panel,
  panelHeight,
  panelWidth,
  type PanelRow,
} from "@/components/synoptic/Panel";
import { Pipe, type PipePaint } from "@/components/synoptic/Pipe";
import { edgePoint, type Box } from "@/components/synoptic/placement";
import { isoEllipse, round } from "@/components/synoptic/projection";
import {
  fillUrl,
  KitDefs,
  KIT_GRADIENT,
} from "@/components/synoptic/symbols/defs";
import { indication, VOLUMES } from "@/components/synoptic/symbols/kit";
import { Label, LABEL_SIZE } from "@/components/synoptic/symbols/Label";
import { pointsAttr } from "@/components/synoptic/symbols/plan";
import {
  FanTop,
  IsoBox,
  IsoCylinder,
  IsoSeam,
  Shadow,
  Slab,
} from "@/components/synoptic/symbols/volume";
import { textWidth } from "@/components/synoptic/text";
import type { Pt } from "@/components/synoptic/types";
import type { SlotReading } from "@/components/synoptic/values";
import {
  at,
  COIL,
  COMPRESSOR,
  EEV,
  FAN,
  P,
  PANELS,
  PLATE,
  REFRIGERANT_RUNS,
  refrigerantRoute,
  runTemperature,
  SLAB,
  SOLENOID,
  TAGS,
  VALVE,
  WATER_RUNS,
  WATER_ROUTES,
  waterFluid,
  type Box3,
  type Temperature,
} from "./synopticLayout";
import {
  isRunning,
  SENSOR_PIECES,
  sensorAttribute,
  synopticMode,
  type SensorPiece,
  type SynopticMode,
} from "./synopticModel";
import { AWHP_CONVENTION_UNITS, type AwhpUnits } from "./units";

const READING_DIGITS = 1;
/** Room around the drawing, in px. */
const MARGIN = 10;
/** Thickness of the slab's lip, as `Slab` draws it. */
const SLAB_LIP = 6;
/** A panel stands this far off the body it reads. */
const PANEL_GAP = 16;

/** The refrigerant is not a fluid of the plates' vocabulary: its hot side
 *  takes the app's heating colour, its cold side the cooling one. */
const REFRIGERANT_PAINT: Record<Temperature, PipePaint> = {
  hot: { stroke: "stroke-hvac-heat", fill: "fill-hvac-heat" },
  cold: { stroke: "stroke-hvac-cool", fill: "fill-hvac-cool" },
};

export type AwhpSynopticProps = {
  values: AwhpAttributes;
  /** Display unit per reading: the driver's where it declares one, else
   *  the name convention (the default). */
  units?: AwhpUnits;
  /** The device's fault level; null when healthy. Colours the fan, the
   *  compressor's light and the panels' frames. */
  fault?: Severity | null;
  className?: string;
};

type Reading = { text: string; unit: string | null };

const slotReading = ({ text, unit }: Reading): SlotReading => ({
  text,
  unit,
  raw: null,
  stale: false,
  faulty: false,
});

/** Where a part's name stands: the kit's spot above it, or a clear spot
 *  beside it. */
type NameSpot = {
  piece: string;
  text: string;
  at: Pt;
  lift: number;
  anchor: "start" | "middle" | "end";
};

/** The finned coil the fan draws the outside air through: a cabinet of the
 *  kit with the fins seen through the frame on its front face, and the
 *  fan on top, coloured and turning by the unit's state. */
function CoilBlock({ fan }: { fan: ReturnType<typeof indication> }) {
  const { x0, y0, x1, y1, z0, z1 } = COIL;
  const inset = 0.25;
  const frame = [
    P(x0 + inset, y1, z0 + 0.2),
    P(x1 - inset, y1, z0 + 0.2),
    P(x1 - inset, y1, z1 - 0.2),
    P(x0 + inset, y1, z1 - 0.2),
  ];
  const pitch = 0.12;
  const fins: number[] = [];
  for (let x = x0 + inset + pitch; x < x1 - inset - pitch / 2; x += pitch)
    fins.push(x);
  return (
    <g data-piece="air">
      <Shadow P={P} cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} r={2.2} />
      <IsoBox P={P} x0={x0} y0={y0} x1={x1} y1={y1} z0={z0} z1={z1} />
      <polygon
        points={pointsAttr(frame)}
        fillOpacity={0.08}
        strokeWidth={1}
        className="fill-synoptic-dark stroke-synoptic-edge"
      />
      {fins.map((x) => {
        const a = P(x, y1, z0 + 0.3);
        const b = P(x, y1, z1 - 0.3);
        return (
          <line
            key={x.toFixed(2)}
            x1={round(a.x)}
            y1={round(a.y)}
            x2={round(b.x)}
            y2={round(b.y)}
            strokeWidth={1}
            strokeOpacity={0.45}
            className="stroke-synoptic-edge"
          />
        );
      })}
      <FanTop P={P} cx={FAN.x} cy={FAN.y} z={z1} r={FAN.r} state={fan} />
    </g>
  );
}

/** The compressor: a drum with its seams, the dome the discharge leaves
 *  through and a dark terminal box on its side. */
function Compressor() {
  const { x, y, r, z1 } = COMPRESSOR;
  return (
    <g data-piece="compressor">
      <Shadow P={P} cx={x} cy={y} r={r + 0.1} />
      <IsoCylinder P={P} cx={x} cy={y} r={r} z0={0} z1={z1} />
      <IsoSeam P={P} cx={x} cy={y} r={r} z={0.25} />
      <IsoSeam P={P} cx={x} cy={y} r={r} z={z1 - 0.2} />
      <IsoCylinder P={P} cx={x} cy={y} r={0.3} z0={z1} z1={z1 + 0.12} />
      <IsoBox
        P={P}
        x0={x + r - 0.02}
        y0={y - 0.2}
        x1={x + r + 0.2}
        y1={y + 0.2}
        z0={0.4}
        z1={0.8}
        top="fill-synoptic-dark"
        left="fill-synoptic-dark"
        right="fill-synoptic-dark"
      />
    </g>
  );
}

/** The four-way reversing valve: a brass body with its solenoid on top. */
function ReversingValve() {
  const brass = fillUrl(KIT_GRADIENT.brass);
  return (
    <g data-piece="valve">
      <IsoBox P={P} {...VALVE} top={brass} left={brass} right={brass} />
      <IsoBox
        P={P}
        {...SOLENOID}
        top="fill-synoptic-dark"
        left="fill-synoptic-dark"
        right="fill-synoptic-dark"
      />
    </g>
  );
}

/** The plate exchanger, as the kit draws it: a cabinet with the plates
 *  seen edge-on through its front face. */
function PlateExchanger() {
  const { x0, y0, x1, y1, z0, z1 } = PLATE;
  const plates = [1, 2, 3, 4, 5, 6, 7].map((i) => x0 + ((x1 - x0) * i) / 8);
  return (
    <g data-piece="water">
      <Shadow P={P} cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} r={1.0} />
      <IsoBox P={P} x0={x0} y0={y0} x1={x1} y1={y1} z0={z0} z1={z1} />
      {plates.map((x) => {
        const a = P(x, y1, z0 + 0.15);
        const b = P(x, y1, z1 - 0.15);
        return (
          <line
            key={x.toFixed(2)}
            x1={round(a.x)}
            y1={round(a.y)}
            x2={round(b.x)}
            y2={round(b.y)}
            strokeWidth={1}
            strokeOpacity={0.5}
            className="stroke-synoptic-edge"
          />
        );
      })}
    </g>
  );
}

/** The expansion valve is the kit's motorised valve on the liquid line. */
function ExpansionValve() {
  const c = { x: EEV.x, y: EEV.y };
  return (
    <g data-piece="eev">
      {VOLUMES.valve_control({
        P,
        L: (p) => p,
        rect: { x0: c.x - 0.5, y0: c.y - 0.5, x1: c.x + 0.5, y1: c.y + 0.5 },
        c,
        dir: { x: 0, y: 1 },
        fault: null,
      })}
    </g>
  );
}

/** One run of the refrigerant circuit, coloured hot or cold for the mode,
 *  its chevrons where it enters the next part and its dash moving while
 *  the unit runs. */
function RefrigerantPipe({
  run,
  mode,
  running,
}: {
  run: (typeof REFRIGERANT_RUNS)[number];
  mode: SynopticMode;
  running: boolean;
}) {
  const temperature = runTemperature(run, mode);
  return (
    <g data-pipe={run} data-temperature={temperature}>
      <Pipe
        points={refrigerantRoute(run, mode).map(at)}
        paint={REFRIGERANT_PAINT[temperature]}
        endArrow
        flowing={running}
        run={run}
      />
    </g>
  );
}

/** A sensor's tag, as the visual language hangs one off a run: a disc on
 *  the run, a 1 px leader to the chip's nearest edge, the caption on the
 *  chip's far side from the run. */
function Tag({
  sensor,
  reading,
  caption,
  discClass,
  on,
  chip,
}: {
  sensor: SensorPiece;
  reading: Reading;
  caption: string;
  discClass: string;
  on: Pt;
  chip: Pt;
}) {
  const w = chipWidth(reading.text, reading.unit);
  const box: Box = {
    x0: chip.x - w / 2,
    y0: chip.y - CHIP_H / 2,
    x1: chip.x + w / 2,
    y1: chip.y + CHIP_H / 2,
  };
  const from = edgePoint(box, on);
  const below = chip.y > on.y;
  return (
    <g data-sensor={sensor}>
      <line
        x1={round(from.x)}
        y1={round(from.y)}
        x2={round(on.x)}
        y2={round(on.y)}
        strokeWidth={1}
        className="stroke-muted-foreground"
        data-leader="tag"
      />
      <circle
        cx={round(on.x)}
        cy={round(on.y)}
        r={DISC_R}
        className={discClass}
      />
      <Chip at={chip} reading={slotReading(reading)} />
      <Caption
        at={{
          x: chip.x,
          y: below
            ? box.y1 + CHIP_LABEL_GAP + LABEL_SIZE
            : box.y0 - CHIP_LABEL_GAP,
        }}
        text={caption}
      />
    </g>
  );
}

/** The screen box a tag takes, caption included, for the frame. */
function tagBox(reading: Reading, caption: string, chip: Pt, below: boolean) {
  const w = Math.max(
    chipWidth(reading.text, reading.unit),
    textWidth(caption, LABEL_SIZE),
  );
  const text = CHIP_LABEL_GAP + LABEL_SIZE;
  return {
    x0: chip.x - w / 2,
    y0: chip.y - CHIP_H / 2 - (below ? 0 : text),
    x1: chip.x + w / 2,
    y1: chip.y + CHIP_H / 2 + (below ? text : 0),
  };
}

/** A machine's panel beside its body: where it stands, joined to the body
 *  by a leader. */
type PanelSpot = {
  piece: keyof typeof PANELS;
  title: string;
  rows: PanelRow[];
  led?: "on" | "off";
  /** The panel's bottom centre. */
  at: Pt;
  box: Box;
  leader: { from: Pt; to: Pt };
};

const topOf = ({ x0, y0, x1, y1, z1 }: Box3) => [
  P(x0, y0, z1),
  P(x1, y0, z1),
  P(x1, y1, z1),
  P(x0, y1, z1),
];

/** The frame around everything drawn: the slab and its lip, the tallest
 *  parts, every tag, panel and name. */
function frameOf(boxes: Box[]): Box {
  const slab = [
    P(SLAB.x0, SLAB.y0, 0),
    P(SLAB.x1, SLAB.y0, 0),
    P(SLAB.x1, SLAB.y1, 0),
    P(SLAB.x0, SLAB.y1, 0),
  ];
  const fanTop = P(FAN.x, FAN.y, COIL.z1);
  const { ry } = isoEllipse(FAN.r);
  const points = [
    ...slab,
    { x: slab[3].x, y: slab[3].y + SLAB_LIP },
    { x: slab[2].x, y: slab[2].y + SLAB_LIP },
    ...topOf(COIL),
    ...topOf(SOLENOID),
    { x: fanTop.x, y: fanTop.y - ry },
    ...boxes.flatMap((b) => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y1 },
    ]),
  ];
  return {
    x0: Math.min(...points.map((p) => p.x)) - MARGIN,
    y0: Math.min(...points.map((p) => p.y)) - MARGIN,
    x1: Math.max(...points.map((p) => p.x)) + MARGIN,
    y1: Math.max(...points.map((p) => p.y)) + MARGIN,
  };
}

/**
 * The air-to-water heat pump drawn with the synoptics' isometric kit: the
 * finned coil under its fan, the compressor under the four-way valve, the
 * expansion valve on the liquid line and the plate exchanger with the
 * water leaving and returning. The refrigerant runs are coloured hot or
 * cold for the mode and move while the unit runs, the water takes the
 * loop it serves, and each reading the device reports hangs off the run it
 * measures or sits in the panel of the machine it belongs to.
 */
export function AwhpSynoptic({
  values,
  units = AWHP_CONVENTION_UNITS,
  fault = null,
  className,
}: AwhpSynopticProps) {
  const { t } = useTranslation("devices");
  const format = useReadingFormat();
  const mode = synopticMode(values.mode);
  const running = isRunning(values);
  const fan = indication(running ? "on" : "off", fault);

  const readings = new Map<SensorPiece, Reading>();
  for (const piece of SENSOR_PIECES) {
    const attribute = sensorAttribute(piece, mode);
    const value = values[attribute];
    if (value == null) continue;
    // The degree sign is written against its number, as the app writes a
    // temperature; any other unit stands after the value, muted.
    const unit = units[attribute] ?? null;
    readings.set(piece, {
      text: format(value, READING_DIGITS, unit === "°" ? unit : null),
      unit: unit === "°" ? null : unit,
    });
  }
  const captions: Record<SensorPiece, string> = {
    outdoor_t: t("controls.awhp.outdoor"),
    air_p: t("controls.awhp.pressure"),
    discharge_t: t("controls.awhp.dischargeTemperature"),
    discharge_p: t("controls.awhp.dischargePressure"),
    suction_t: t("controls.awhp.suctionTemperature"),
    suction_p: t("controls.awhp.suctionPressure"),
    water_p: t("controls.awhp.pressure"),
    inlet_t: t("controls.awhp.waterIn"),
    outlet_t: t("controls.awhp.waterOut"),
  };
  const discClass = (piece: SensorPiece) => {
    const { run } = TAGS[piece] ?? { run: null };
    if (run === null) return "fill-muted-foreground";
    if (run === "waterOut" || run === "waterIn")
      return fluidFillClass(waterFluid(run, mode));
    return REFRIGERANT_PAINT[runTemperature(run, mode)].fill;
  };
  const tags = SENSOR_PIECES.flatMap((piece) => {
    const reading = readings.get(piece);
    const spot = TAGS[piece];
    if (!reading || !spot) return [];
    const on = at(spot.on);
    const chip = { x: on.x + spot.chip.x, y: on.y + spot.chip.y };
    return [{ piece, reading, on, chip, caption: captions[piece] }];
  });

  const rowsOf = (pieces: readonly SensorPiece[]): PanelRow[] =>
    pieces.flatMap((piece) => {
      const reading = readings.get(piece);
      return reading
        ? [{ label: captions[piece], reading: slotReading(reading) }]
        : [];
    });
  // The compressor's panel stands off its right side, the plate
  // exchanger's under its front corner, clear of the water runs.
  const compressorRows = rowsOf(PANELS.compressor);
  const compressorTitle = t("controls.awhp.compressor");
  const compressorLed = running ? "on" : "off";
  const compressorW = panelWidth(compressorTitle, 1, compressorRows);
  const compressorH = panelHeight(compressorRows.length);
  // The panel is centred on the drum's top so it clears the water runs
  // below; its leader meets the drum at mid-height.
  const compressorSide = P(COMPRESSOR.x, COMPRESSOR.y, COMPRESSOR.z1 / 2);
  const compressorTop = P(COMPRESSOR.x, COMPRESSOR.y, COMPRESSOR.z1);
  const compressorEdge = {
    x: compressorSide.x + isoEllipse(COMPRESSOR.r).rx,
    y: compressorSide.y,
  };
  const compressorPanelY = compressorTop.y - 22;
  const plateRows = rowsOf(PANELS.water);
  const plateTitle = t("controls.awhp.plateExchanger");
  const plateW = panelWidth(plateTitle, 0, plateRows);
  const plateH = panelHeight(plateRows.length);
  const plateFoot = P(PLATE.x1, PLATE.y1, 0);
  const panels: PanelSpot[] = [
    {
      piece: "compressor",
      title: compressorTitle,
      rows: compressorRows,
      led: compressorLed,
      at: {
        x: compressorEdge.x + PANEL_GAP + compressorW / 2,
        y: compressorPanelY + compressorH / 2,
      },
      box: {
        x0: compressorEdge.x + PANEL_GAP,
        y0: compressorPanelY - compressorH / 2,
        x1: compressorEdge.x + PANEL_GAP + compressorW,
        y1: compressorPanelY + compressorH / 2,
      },
      leader: {
        from: { x: compressorEdge.x + PANEL_GAP, y: compressorEdge.y },
        to: compressorEdge,
      },
    },
    {
      piece: "water",
      title: plateTitle,
      rows: plateRows,
      at: { x: plateFoot.x - 24, y: plateFoot.y + PANEL_GAP + plateH },
      box: {
        x0: plateFoot.x - 24 - plateW / 2,
        y0: plateFoot.y + PANEL_GAP,
        x1: plateFoot.x - 24 + plateW / 2,
        y1: plateFoot.y + PANEL_GAP + plateH,
      },
      leader: {
        from: { x: plateFoot.x - 24, y: plateFoot.y + PANEL_GAP },
        to: { x: plateFoot.x - 24, y: plateFoot.y - 12 },
      },
    },
  ];

  const fanTop = P(FAN.x, FAN.y, COIL.z1);
  const solenoidTop = P(
    (SOLENOID.x0 + SOLENOID.x1) / 2,
    (SOLENOID.y0 + SOLENOID.y1) / 2,
    SOLENOID.z1,
  );
  const eevTop = P(EEV.x, EEV.y, 1.35);
  const names: NameSpot[] = [
    {
      piece: "air",
      text: t("controls.awhp.fanCoil"),
      at: { x: fanTop.x, y: fanTop.y - isoEllipse(FAN.r).ry },
      lift: 10,
      anchor: "middle",
    },
    {
      piece: "valve",
      text: t("controls.awhp.reversingValve"),
      at: { x: solenoidTop.x, y: solenoidTop.y - 6 },
      lift: 10,
      anchor: "middle",
    },
    {
      piece: "eev",
      text: t("controls.awhp.expansionValve"),
      at: { x: eevTop.x - 18, y: eevTop.y + 18 },
      lift: 0,
      anchor: "end",
    },
  ];
  const nameBox = (n: NameSpot): Box => {
    const w = textWidth(n.text, LABEL_SIZE);
    const x0 =
      n.anchor === "end"
        ? n.at.x - w
        : n.anchor === "start"
          ? n.at.x
          : n.at.x - w / 2;
    const y = n.at.y - n.lift;
    return { x0, y0: y - LABEL_SIZE, x1: x0 + w, y1: y + 2 };
  };

  const frame = frameOf([
    ...tags.map((tag) =>
      tagBox(tag.reading, tag.caption, tag.chip, tag.chip.y > tag.on.y),
    ),
    ...panels.map((panel) => panel.box),
    ...names.map(nameBox),
  ]);

  return (
    <svg
      viewBox={`${round(frame.x0)} ${round(frame.y0)} ${round(frame.x1 - frame.x0)} ${round(frame.y1 - frame.y0)}`}
      role="img"
      aria-label={t("controls.awhp.figureLabel")}
      data-testid="awhp-synoptic"
      data-mode={mode}
      data-running={running ? "" : undefined}
      className={cn("rounded-lg bg-synoptic-plate", className)}
    >
      <KitDefs />
      <Slab P={P} x0={SLAB.x0} y0={SLAB.y0} x1={SLAB.x1} y1={SLAB.y1} />
      <CoilBlock fan={fan} />
      {/* Painted back to front: the suction loop behind the compressor,
          then the machines, then the runs that pass in front of them. */}
      <RefrigerantPipe run="suction" mode={mode} running={running} />
      <Compressor />
      <RefrigerantPipe run="discharge" mode={mode} running={running} />
      <ReversingValve />
      <RefrigerantPipe run="coil" mode={mode} running={running} />
      <RefrigerantPipe run="plate" mode={mode} running={running} />
      <RefrigerantPipe run="liquidCoil" mode={mode} running={running} />
      <RefrigerantPipe run="liquidPlate" mode={mode} running={running} />
      <ExpansionValve />
      <PlateExchanger />
      {WATER_RUNS.map((run) => {
        const fluid = waterFluid(run, mode);
        return (
          <g key={run} data-pipe={run} data-fluid={fluid}>
            <Pipe
              points={WATER_ROUTES[run].map(at)}
              fluid={fluid}
              endArrow
              flowing={running}
              run={run}
            />
          </g>
        );
      })}
      {tags.map((tag) => (
        <Tag
          key={tag.piece}
          sensor={tag.piece}
          reading={tag.reading}
          caption={tag.caption}
          discClass={discClass(tag.piece)}
          on={tag.on}
          chip={tag.chip}
        />
      ))}
      {panels.map((panel) => (
        <g key={panel.piece} data-readout={panel.piece}>
          <line
            x1={round(panel.leader.from.x)}
            y1={round(panel.leader.from.y)}
            x2={round(panel.leader.to.x)}
            y2={round(panel.leader.to.y)}
            strokeWidth={1}
            className="stroke-muted-foreground"
            data-leader="panel"
          />
          {panel.rows.length > 0 ? (
            <Panel
              at={panel.at}
              title={panel.title}
              rows={panel.rows}
              led={panel.led}
              fault={fault}
            />
          ) : (
            // A machine with no reading keeps its name and its light where
            // its panel would stand.
            <Label
              text={panel.title}
              at={{ x: panel.box.x0, y: panel.box.y0 + 15 }}
              lift={0}
              anchor="start"
              led={panel.led}
              fault={fault}
            />
          )}
        </g>
      ))}
      {names.map((n) => (
        <g key={n.piece} data-name={n.piece}>
          <Label text={n.text} at={n.at} lift={n.lift} anchor={n.anchor} />
        </g>
      ))}
    </svg>
  );
}

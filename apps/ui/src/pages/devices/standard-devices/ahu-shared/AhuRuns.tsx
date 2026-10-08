import {
  CoilGlyph,
  CoilLoopGlyph,
  DamperGlyph,
  FanGlyph,
  FilterGlyph,
  FILTER_WIDTH,
  PREFILTER_WIDTH,
} from "@/components/synoptic/glyphs";
import {
  Duct,
  DUCT_HEIGHT,
  DuctCaption,
  READOUT_LINE,
  Readout,
  ReadoutList,
  StreamBlock,
  type ReadoutListRow,
  type StreamRow,
} from "@/components/synoptic/duct";
import type { AhuUnits } from "./attributes";
import { useReadingFormat } from "./format";
import { useAhuSynopticLabel } from "./labels";
import type { AhuReadings, AhuStates } from "./streams";

/** Shared geometry of the AHU synoptics (viewBox units). The ducts run
 *  between the two stream-block columns; the equipment columns are the same
 *  in both runs so fans and readouts line up vertically. */
export const VIEW_WIDTH = 1100;
export const DUCT_X = 150;
export const DUCT_WIDTH = 800;
const LEFT_BLOCK_X = 24;
const RIGHT_BLOCK_X = 968;
const FAN_CX = 835;
/** Dampers sit just inside the duct ends. */
const INLET_DAMPER_CX = DUCT_X + 36;
const OUTLET_DAMPER_CX = DUCT_X + DUCT_WIDTH - 40;
/** The filter stage: pre-filter then filter on the supply, filter alone on
 *  the extract. */
const SUPPLY_PREFILTER_X = DUCT_X + 60;
const SUPPLY_FILTER_X = DUCT_X + 86;
const EXTRACT_FILTER_X = DUCT_X + DUCT_WIDTH - 60;
const COIL_SLOT_CX = 650;
/** Coils side by side: close when they only show their valve, apart when
 *  their water loops list readings under them. */
const COIL_SPACING = 56;
const COIL_LOOP_SPACING = 150;
/** Readouts sit one line of label + value away from the duct wall. */
const READOUT_GAP = 24;
/** The water pipes drop this far before the loop's readings. */
const COIL_PIPE_HEIGHT = 70;
const COIL_LIST_WIDTH = 96;

const RATIO_DIGITS = 0;
const TEMPERATURE_DIGITS = 1;
const WATER_FLOW_DIGITS = 2;
const POWER_DIGITS = 0;
const PRESSURE_DIGITS = 0;

/** Every value an AHU run can draw: numeric readings and boolean states. */
export type AhuRunValues = AhuReadings & AhuStates;

/** A stream at a duct end: its measures when it has any, else its name. */
function StreamEnd({
  x,
  cy,
  title,
  rows,
}: {
  x: number;
  cy: number;
  title: string;
  rows: StreamRow[];
}) {
  return rows.length ? (
    <StreamBlock x={x} cy={cy} title={title} rows={rows} />
  ) : (
    <DuctCaption x={x} cy={cy} text={title} />
  );
}

type Coil = "heating" | "cooling";

const COIL_KEYS = {
  heating: {
    valve: "heatingValve",
    flow: "heatingWaterFlow",
    supply: "heatingWaterSupplyTemperature",
    return: "heatingWaterReturnTemperature",
    power: "heatingPower",
    energy: "heatingEnergy",
  },
  cooling: {
    valve: "coolingValve",
    flow: "coolingWaterFlow",
    supply: "coolingWaterSupplyTemperature",
    return: "coolingWaterReturnTemperature",
    power: "coolingPower",
    energy: "coolingEnergy",
  },
} as const;

/** Whether a coil's water side is instrumented: any hydraulic reading. */
export function coilHasLoop(values: AhuReadings, coil: Coil): boolean {
  const keys = COIL_KEYS[coil];
  return (
    values[keys.flow] != null ||
    values[keys.supply] != null ||
    values[keys.return] != null ||
    values[keys.power] != null ||
    values[keys.energy] != null
  );
}

/** Whether any coil draws a water loop, so the layout reserves its band. */
export function hasCoilLoop(values: AhuReadings): boolean {
  return coilHasLoop(values, "heating") || coilHasLoop(values, "cooling");
}

type RunProps = {
  /** Top edge of the duct. */
  y: number;
  values: AhuRunValues;
  units: AhuUnits;
};

/** The supply run, left to right: fresh air in through its damper, filter
 *  stage, heating and cooling coils (only those the unit has), supply fan,
 *  supply damper, supply air out. Fan speed and valve openings read below
 *  the duct, under their equipment; a coil whose water side is measured
 *  draws its loop there instead, with the readings listed under the pipes. */
export function SupplyRun({
  y,
  values,
  units,
  fresh,
  supply,
}: RunProps & { fresh: StreamRow[]; supply: StreamRow[] }) {
  const label = useAhuSynopticLabel();
  const format = useReadingFormat();
  const cy = y + DUCT_HEIGHT / 2;
  const ductBottom = y + DUCT_HEIGHT;
  const readoutY = ductBottom + READOUT_GAP;

  const hasHeating = values.heatingValve != null;
  const hasCooling = values.coolingValve != null;
  const loops = hasCoilLoop(values);
  const spacing = loops ? COIL_LOOP_SPACING : COIL_SPACING;
  // Both coils share the slot side by side; a lone coil centres in it.
  const heatingCx = hasCooling ? COIL_SLOT_CX - spacing / 2 : COIL_SLOT_CX;
  const coolingCx = hasHeating ? COIL_SLOT_CX + spacing / 2 : COIL_SLOT_CX;

  const hasPrefilter = values.supplyPrefilterClogged != null;
  const filterCx = SUPPLY_FILTER_X + FILTER_WIDTH / 2;
  const filterStage = filterStateReadout({
    clogged: [values.supplyPrefilterClogged, values.supplyFilterClogged],
    differentialPressure: values.supplyFilterDifferentialPressure,
    unit: units.supplyFilterDifferentialPressure,
    label,
    format,
  });

  const coilLoop = (coil: Coil, cx: number) => {
    const keys = COIL_KEYS[coil];
    const opening = values[keys.valve];
    const heating = coil === "heating";
    const temperature = (key: typeof keys.supply | typeof keys.return) =>
      values[key] == null
        ? undefined
        : format(values[key], TEMPERATURE_DIGITS, units[key]);
    const rows: ReadoutListRow[] = [
      ...optionalRow(
        label("waterFlow"),
        values[keys.flow],
        WATER_FLOW_DIGITS,
        units[keys.flow],
        format,
      ),
      ...optionalRow(
        label("power"),
        values[keys.power],
        POWER_DIGITS,
        units[keys.power],
        format,
      ),
    ];
    return (
      <>
        <CoilLoopGlyph
          cx={cx}
          y={ductBottom}
          height={COIL_PIPE_HEIGHT}
          colorClass={heating ? "stroke-hvac-heat" : "stroke-hvac-cool"}
          fillClass={heating ? "fill-hvac-heat" : "fill-hvac-cool"}
          active={(opening ?? 0) > 0}
          title={label(heating ? "heatingLoop" : "coolingLoop")}
          valve={{
            text: format(opening, RATIO_DIGITS, units[keys.valve]),
            opening: Math.min(Math.max(opening ?? 0, 0), 100) / 100,
          }}
          inlet={temperature(keys.supply)}
          outlet={temperature(keys.return)}
        />
        {rows.length > 0 && (
          <ReadoutList
            x={cx - COIL_LIST_WIDTH / 2}
            y={ductBottom + COIL_PIPE_HEIGHT + 16}
            rows={rows}
          />
        )}
      </>
    );
  };

  const coil = (coil: Coil, cx: number) => {
    const opening = values[COIL_KEYS[coil].valve];
    const heating = coil === "heating";
    return (
      <>
        <CoilGlyph
          cx={cx}
          ductY={y}
          colorClass={heating ? "stroke-hvac-heat" : "stroke-hvac-cool"}
          fillClass={heating ? "fill-hvac-heat" : "fill-hvac-cool"}
          title={label(heating ? "heatingCoil" : "coolingCoil")}
          opening={opening}
        />
        {coilHasLoop(values, coil) ? (
          coilLoop(coil, cx)
        ) : (
          <Readout
            cx={cx}
            y={readoutY}
            label={label(heating ? "heating" : "cooling")}
            value={format(opening, RATIO_DIGITS, units[COIL_KEYS[coil].valve])}
          />
        )}
      </>
    );
  };

  return (
    <g>
      <Duct
        x={DUCT_X}
        y={y}
        width={DUCT_WIDTH}
        dir="right"
        speed={airflowSpeed(values.supplyFanSpeed, values.supplyFlowSwitch)}
      />
      {values.outdoorAirDamperOpen != null && (
        <>
          <DamperGlyph
            cx={INLET_DAMPER_CX}
            cy={cy}
            open={values.outdoorAirDamperOpen}
            title={label("freshAirDamper")}
          />
          <Readout
            cx={INLET_DAMPER_CX}
            y={readoutY}
            label={label("damper")}
            {...damperState(values.outdoorAirDamperOpen, label)}
            textual
          />
        </>
      )}
      {hasPrefilter && (
        <FilterGlyph
          x={SUPPLY_PREFILTER_X}
          cy={cy}
          width={PREFILTER_WIDTH}
          title={label("prefilter")}
          clogged={values.supplyPrefilterClogged}
        />
      )}
      <FilterGlyph
        x={SUPPLY_FILTER_X}
        cy={cy}
        title={label("filter")}
        clogged={values.supplyFilterClogged}
      />
      {filterStage && (
        <Readout
          cx={filterCx}
          y={readoutY}
          label={label("filter")}
          {...filterStage}
        />
      )}
      {hasHeating && coil("heating", heatingCx)}
      {hasCooling && coil("cooling", coolingCx)}
      <FanGlyph
        cx={FAN_CX}
        cy={cy}
        spin="cw"
        spinning={fanSpinning(values.supplyFanSpeed, values.supplyFlowSwitch)}
        title={label("supplyFan")}
      />
      <Readout
        cx={FAN_CX}
        y={readoutY}
        label={label("supplyFanShort")}
        value={format(
          values.supplyFanSpeed,
          RATIO_DIGITS,
          units.supplyFanSpeed,
        )}
        detail={flowSwitchDetail(values.supplyFlowSwitch, label)}
      />
      {values.supplyAirDamperOpen != null && (
        <>
          <DamperGlyph
            cx={OUTLET_DAMPER_CX}
            cy={cy}
            open={values.supplyAirDamperOpen}
            title={label("supplyDamper")}
          />
          <Readout
            cx={OUTLET_DAMPER_CX}
            y={readoutY}
            label={label("damper")}
            {...damperState(values.supplyAirDamperOpen, label)}
            textual
          />
        </>
      )}
      <StreamEnd
        x={LEFT_BLOCK_X}
        cy={cy}
        title={label("freshAir")}
        rows={fresh}
      />
      <StreamEnd
        x={RIGHT_BLOCK_X}
        cy={cy}
        title={label("supplyAir")}
        rows={supply}
      />
    </g>
  );
}

/** The extract run, right to left: extract air in, filter, extract fan,
 *  exhaust out. The fan speed and filter state read above the duct, over
 *  their equipment. */
export function ExtractRun({
  y,
  values,
  units,
  extract,
  exhaust,
}: RunProps & { extract: StreamRow[]; exhaust?: StreamRow[] }) {
  const label = useAhuSynopticLabel();
  const format = useReadingFormat();
  const cy = y + DUCT_HEIGHT / 2;
  const flowDetail = flowSwitchDetail(values.extractFlowSwitch, label);
  // Label, value and (when there is one) the airflow line stack up from
  // the duct wall.
  const readoutY =
    y - READOUT_GAP - READOUT_LINE - (flowDetail ? READOUT_LINE : 0);
  const filterStage = filterStateReadout({
    clogged: [values.extractFilterClogged],
    differentialPressure: values.extractFilterDifferentialPressure,
    unit: units.extractFilterDifferentialPressure,
    label,
    format,
  });

  return (
    <g>
      <Duct
        x={DUCT_X}
        y={y}
        width={DUCT_WIDTH}
        dir="left"
        speed={airflowSpeed(values.extractFanSpeed, values.extractFlowSwitch)}
      />
      <FilterGlyph
        x={EXTRACT_FILTER_X}
        cy={cy}
        title={label("filter")}
        clogged={values.extractFilterClogged}
      />
      {filterStage && (
        <Readout
          cx={EXTRACT_FILTER_X + FILTER_WIDTH / 2}
          y={y - READOUT_GAP - READOUT_LINE}
          label={label("filter")}
          {...filterStage}
        />
      )}
      <FanGlyph
        cx={FAN_CX}
        cy={cy}
        spin="ccw"
        spinning={fanSpinning(values.extractFanSpeed, values.extractFlowSwitch)}
        title={label("extractFan")}
      />
      <Readout
        cx={FAN_CX}
        y={readoutY}
        label={label("extractFanShort")}
        value={format(
          values.extractFanSpeed,
          RATIO_DIGITS,
          units.extractFanSpeed,
        )}
        detail={flowDetail}
      />
      <StreamEnd
        x={LEFT_BLOCK_X}
        cy={cy}
        title={label("exhaustAir")}
        rows={exhaust ?? []}
      />
      <StreamEnd
        x={RIGHT_BLOCK_X}
        cy={cy}
        title={label("extractAir")}
        rows={extract}
      />
    </g>
  );
}

type Label = (
  key: Parameters<ReturnType<typeof useAhuSynopticLabel>>[0],
) => string;
type Format = ReturnType<typeof useReadingFormat>;

/** Whether a fan turns: proven airflow when the unit has a flow switch,
 *  else a reported speed (as `air_extractor` decides it). */
function fanSpinning(
  speed: number | null | undefined,
  flowSwitch: boolean | null | undefined,
): boolean {
  return flowSwitch ?? (speed ?? 0) > 0;
}

/** The speed the duct animates at: none when a flow switch says there is
 *  no air, whatever the fan signal. */
function airflowSpeed(
  speed: number | null | undefined,
  flowSwitch: boolean | null | undefined,
): number | null | undefined {
  if (flowSwitch === false) return 0;
  if (flowSwitch === true && !speed) return 100;
  return speed;
}

function flowSwitchDetail(
  flowSwitch: boolean | null | undefined,
  label: Label,
): { value: string; valueClass: string } | undefined {
  if (flowSwitch == null) return undefined;
  return flowSwitch
    ? { value: label("flowProven"), valueClass: "fill-status-ok" }
    : { value: label("flowMissing"), valueClass: "fill-status-warning" };
}

function damperState(
  open: boolean,
  label: Label,
): { value: string; valueClass: string } {
  return open
    ? { value: label("damperOpen"), valueClass: "fill-foreground" }
    : { value: label("damperClosed"), valueClass: "fill-muted-foreground" };
}

/** What the filter readout says: the pressure drop when measured, else the
 *  clogged/clean verdict from the switches; nothing when the unit reports
 *  neither. A clogged stage reads in the alert colour either way. */
function filterStateReadout({
  clogged,
  differentialPressure,
  unit,
  label,
  format,
}: {
  clogged: (boolean | null | undefined)[];
  differentialPressure: number | null | undefined;
  unit: string | null | undefined;
  label: Label;
  format: Format;
}): { value: string; valueClass: string; textual?: boolean } | null {
  const isClogged = clogged.some((state) => state === true);
  const hasSwitch = clogged.some((state) => state != null);
  if (differentialPressure != null) {
    return {
      value: format(differentialPressure, PRESSURE_DIGITS, unit),
      valueClass: isClogged ? "fill-status-error" : "fill-foreground",
    };
  }
  if (!hasSwitch) return null;
  return isClogged
    ? {
        value: label("filterClogged"),
        valueClass: "fill-status-error",
        textual: true,
      }
    : {
        value: label("filterClean"),
        valueClass: "fill-foreground",
        textual: true,
      };
}

function optionalRow(
  rowLabel: string,
  value: number | null | undefined,
  digits: number,
  unit: string | null | undefined,
  format: Format,
): ReadoutListRow[] {
  return value == null
    ? []
    : [{ label: rowLabel, value: format(value, digits, unit) }];
}

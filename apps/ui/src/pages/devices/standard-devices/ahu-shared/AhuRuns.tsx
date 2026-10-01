import { CoilGlyph, FanGlyph, FilterGlyph } from "@/components/synoptic/glyphs";
import {
  Duct,
  DUCT_HEIGHT,
  DuctCaption,
  StreamBlock,
  Readout,
  type StreamRow,
} from "@/components/synoptic/duct";
import type { AhuUnits } from "./attributes";
import { useReadingFormat } from "./format";
import { useAhuSynopticLabel } from "./labels";
import type { AhuReadings } from "./streams";

/** Shared geometry of the AHU synoptics (viewBox units). The ducts run
 *  between the two stream-block columns; the equipment columns are the same
 *  in both runs so fans and readouts line up vertically. */
export const VIEW_WIDTH = 1100;
export const DUCT_X = 150;
export const DUCT_WIDTH = 800;
const LEFT_BLOCK_X = 24;
const RIGHT_BLOCK_X = 968;
const FAN_CX = 800;
const COIL_SLOT_CX = 650;
const COIL_SPACING = 56;
/** Readouts sit one line of label + value away from the duct wall. */
const READOUT_GAP = 24;

const RATIO_DIGITS = 0;

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

type RunProps = {
  /** Top edge of the duct. */
  y: number;
  values: AhuReadings;
  units: AhuUnits;
};

/** The supply run, left to right: fresh air in, filter, heating and cooling
 *  coils (only those the unit has), supply fan, supply air out. Fan speed
 *  and valve openings read below the duct, under their equipment. */
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
  const readoutY = y + DUCT_HEIGHT + READOUT_GAP;

  const hasHeating = values.heatingValve != null;
  const hasCooling = values.coolingValve != null;
  // Both coils share the slot side by side; a lone coil centres in it.
  const heatingCx = hasCooling ? COIL_SLOT_CX - COIL_SPACING / 2 : COIL_SLOT_CX;
  const coolingCx = hasHeating ? COIL_SLOT_CX + COIL_SPACING / 2 : COIL_SLOT_CX;

  return (
    <g>
      <Duct
        x={DUCT_X}
        y={y}
        width={DUCT_WIDTH}
        dir="right"
        speed={values.supplyFanSpeed}
      />
      <FilterGlyph x={DUCT_X + 64} cy={cy} title={label("filter")} />
      {hasHeating && (
        <>
          <CoilGlyph
            cx={heatingCx}
            ductY={y}
            colorClass="stroke-hvac-heat"
            fillClass="fill-hvac-heat"
            title={label("heatingCoil")}
            opening={values.heatingValve}
          />
          <Readout
            cx={heatingCx}
            y={readoutY}
            label={label("heating")}
            value={format(
              values.heatingValve,
              RATIO_DIGITS,
              units.heatingValve,
            )}
          />
        </>
      )}
      {hasCooling && (
        <>
          <CoilGlyph
            cx={coolingCx}
            ductY={y}
            colorClass="stroke-hvac-cool"
            fillClass="fill-hvac-cool"
            title={label("coolingCoil")}
            opening={values.coolingValve}
          />
          <Readout
            cx={coolingCx}
            y={readoutY}
            label={label("cooling")}
            value={format(
              values.coolingValve,
              RATIO_DIGITS,
              units.coolingValve,
            )}
          />
        </>
      )}
      <FanGlyph
        cx={FAN_CX}
        cy={cy}
        spin="cw"
        spinning={(values.supplyFanSpeed ?? 0) > 0}
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
      />
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
 *  exhaust out. The fan speed reads above the duct, over the fan. */
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
  const readoutY = y - READOUT_GAP - 17;

  return (
    <g>
      <Duct
        x={DUCT_X}
        y={y}
        width={DUCT_WIDTH}
        dir="left"
        speed={values.extractFanSpeed}
      />
      <FilterGlyph
        x={DUCT_X + DUCT_WIDTH - 90}
        cy={cy}
        title={label("filter")}
      />
      <FanGlyph
        cx={FAN_CX}
        cy={cy}
        spin="ccw"
        spinning={(values.extractFanSpeed ?? 0) > 0}
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

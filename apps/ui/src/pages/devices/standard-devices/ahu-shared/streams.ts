import { useTranslation } from "react-i18next";
import type { StreamRow, StreamSetpoint } from "@/components/synoptic/duct";
import type { AhuAttributeKey, AhuStateKey, AhuUnits } from "./attributes";
import { useReadingFormat } from "./format";
import { useAhuSynopticLabel } from "./labels";

/** The numeric view keys of an AHU: every attribute but the mode and the
 *  boolean states (run state, switches, filters), which read as words. */
export type AhuReadingKey = Exclude<AhuAttributeKey, AhuStateKey | "hvacMode">;

/** Numeric readings of an AHU by view key; a variant's `types.ts` narrows
 *  it to its own schema. */
export type AhuReadings = Partial<Record<AhuReadingKey, number | null>>;

/** The boolean states of an AHU by view key. */
export type AhuStates = Partial<Record<AhuStateKey, boolean | null>>;

/** The setpoints an AHU can expose; which ones a device accepts writes for
 *  is decided per device from the attribute's `readWriteModes`. */
export type AhuSetpointKey =
  | "supplyAirTemperatureSetpoint"
  | "supplyAirTemperatureCoolingSetpoint"
  | "supplyAirPressureSetpoint"
  | "extractAirPressureSetpoint"
  | "supplyAirFlowSetpoint"
  | "extractAirFlowSetpoint";

export type AhuStreamsInput = {
  values: AhuReadings;
  units: AhuUnits;
  writableSetpoints: readonly AhuSetpointKey[];
  onEdit: (key: AhuSetpointKey) => void;
};

export type AhuStreams = {
  fresh: StreamRow[];
  supply: StreamRow[];
  extract: StreamRow[];
  exhaust: StreamRow[];
};

const TEMPERATURE_DIGITS = 1;
const PRESSURE_DIGITS = 0;
const FLOW_DIGITS = 0;
const HUMIDITY_DIGITS = 0;
const CO2_DIGITS = 0;

type Stream = "freshAir" | "supplyAir" | "extractAir" | "exhaustAir";

/** The rows of the four air-stream blocks, from what the unit reports.
 *
 *  The supply and extract temperatures are required by the schemas, so
 *  their rows are always there (a dash when not reporting); the optional
 *  measures — fresh and exhaust temperatures, pressures, air flows,
 *  humidity, CO₂ — get a row only when the unit reports or targets them, so
 *  a stream with nothing measured is just named. A setpoint is attached to
 *  its process value when the unit reports it or accepts writes for it, so
 *  a writable-but-unread setpoint still offers its editor. A supply
 *  temperature regulated in a dead band carries its two setpoints, heating
 *  then cooling. */
export function useAhuStreams({
  values,
  units,
  writableSetpoints,
  onEdit,
}: AhuStreamsInput): AhuStreams {
  const { t: tCommon } = useTranslation("common");
  const label = useAhuSynopticLabel();
  const format = useReadingFormat();

  const title = (
    stream: Stream,
    measure: "temperature" | "pressure" | "flow" | "humidity" | "co2",
  ) => `${label(stream)} · ${label(measure)}`;

  const setpoint = (
    key: AhuSetpointKey,
    digits: number,
    pillLabel: string = label("setpoint"),
  ): StreamSetpoint | undefined => {
    const writable = writableSetpoints.includes(key);
    if (values[key] == null && !writable) return undefined;
    return {
      label: pillLabel,
      value: format(values[key], digits, units[key]),
      onEdit: writable ? () => onEdit(key) : undefined,
      editLabel: `${tCommon("common.edit")} ${label(key)}`,
    };
  };

  const present = (...targets: (StreamSetpoint | undefined)[]) =>
    targets.filter((target): target is StreamSetpoint => target != null);

  /** A row for an optional measure, when reported or targeted. */
  const measured = (
    kind: StreamRow["kind"],
    rowTitle: string,
    key: AhuReadingKey,
    digits: number,
    setpoints: StreamSetpoint[] = [],
  ): StreamRow[] => {
    if (values[key] == null && setpoints.length === 0) return [];
    return [
      {
        kind,
        title: rowTitle,
        value: format(values[key], digits, units[key]),
        setpoints,
      },
    ];
  };

  const heatingSetpoint = setpoint(
    "supplyAirTemperatureSetpoint",
    TEMPERATURE_DIGITS,
  );
  const coolingSetpoint = setpoint(
    "supplyAirTemperatureCoolingSetpoint",
    TEMPERATURE_DIGITS,
  );
  // With a dead band, the two pills say which band each one bounds.
  const supplyTemperatureSetpoints = coolingSetpoint
    ? present(
        heatingSetpoint && { ...heatingSetpoint, label: label("heating") },
        { ...coolingSetpoint, label: label("cooling") },
      )
    : present(heatingSetpoint);

  return {
    fresh: measured(
      "T",
      title("freshAir", "temperature"),
      "outdoorAirTemperature",
      TEMPERATURE_DIGITS,
    ),
    supply: [
      {
        kind: "T",
        title: title("supplyAir", "temperature"),
        value: format(
          values.supplyAirTemperature,
          TEMPERATURE_DIGITS,
          units.supplyAirTemperature,
        ),
        setpoints: supplyTemperatureSetpoints,
      },
      ...measured(
        "P",
        title("supplyAir", "pressure"),
        "supplyAirPressure",
        PRESSURE_DIGITS,
        present(setpoint("supplyAirPressureSetpoint", PRESSURE_DIGITS)),
      ),
      ...measured(
        "F",
        title("supplyAir", "flow"),
        "supplyAirFlow",
        FLOW_DIGITS,
        present(setpoint("supplyAirFlowSetpoint", FLOW_DIGITS)),
      ),
      ...measured(
        "H",
        title("supplyAir", "humidity"),
        "supplyAirHumidity",
        HUMIDITY_DIGITS,
      ),
    ],
    extract: [
      {
        kind: "T",
        title: title("extractAir", "temperature"),
        value: format(
          values.extractAirTemperature,
          TEMPERATURE_DIGITS,
          units.extractAirTemperature,
        ),
      },
      ...measured(
        "P",
        title("extractAir", "pressure"),
        "extractAirPressure",
        PRESSURE_DIGITS,
        present(setpoint("extractAirPressureSetpoint", PRESSURE_DIGITS)),
      ),
      ...measured(
        "F",
        title("extractAir", "flow"),
        "extractAirFlow",
        FLOW_DIGITS,
        present(setpoint("extractAirFlowSetpoint", FLOW_DIGITS)),
      ),
      ...measured(
        "H",
        title("extractAir", "humidity"),
        "extractAirHumidity",
        HUMIDITY_DIGITS,
      ),
      ...measured("C", title("extractAir", "co2"), "extractAirCo2", CO2_DIGITS),
    ],
    exhaust: measured(
      "T",
      title("exhaustAir", "temperature"),
      "exhaustAirTemperature",
      TEMPERATURE_DIGITS,
    ),
  };
}

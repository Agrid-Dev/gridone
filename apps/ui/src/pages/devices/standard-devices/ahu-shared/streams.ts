import { useTranslation } from "react-i18next";
import type { StreamRow } from "@/components/synoptic/duct";
import type { AhuAttributeKey, AhuUnits } from "./attributes";
import { useReadingFormat } from "./format";
import { useAhuSynopticLabel } from "./labels";

/** The numeric view keys of an AHU: every attribute but the run state and
 *  mode, which the status rail shows. */
export type AhuReadingKey = Exclude<AhuAttributeKey, "onoffState" | "hvacMode">;

/** Numeric readings of an AHU by view key; a variant's `types.ts` narrows
 *  it to its own schema. */
export type AhuReadings = Partial<Record<AhuReadingKey, number | null>>;

/** The setpoints an AHU can expose; which ones a device accepts writes for
 *  is decided per device from the attribute's `readWriteModes`. */
export type AhuSetpointKey =
  | "supplyAirTemperatureSetpoint"
  | "supplyAirPressureSetpoint"
  | "extractAirPressureSetpoint";

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

/** The rows of the four air-stream blocks, from what the unit reports.
 *
 *  The supply and extract temperatures are required by the schemas, so
 *  their rows are always there (a dash when not reporting); the optional
 *  measures — fresh and exhaust temperatures, pressures — get a row only
 *  when the unit reports or targets them, so a stream with nothing measured
 *  is just named. A setpoint is attached to its process value when the unit
 *  reports it or accepts writes for it, so a writable-but-unread setpoint
 *  still offers its editor. */
export function useAhuStreams({
  values,
  units,
  writableSetpoints,
  onEdit,
}: AhuStreamsInput): AhuStreams {
  const { t: tCommon } = useTranslation("common");
  const label = useAhuSynopticLabel();
  const format = useReadingFormat();

  const temperature = (
    stream: "freshAir" | "supplyAir" | "extractAir" | "exhaustAir",
    key: AhuReadingKey,
  ): StreamRow => ({
    kind: "T",
    title: `${label(stream)} · ${label("temperature")}`,
    value: format(values[key], TEMPERATURE_DIGITS, units[key]),
  });

  const setpoint = (key: AhuSetpointKey, digits: number) => {
    const writable = writableSetpoints.includes(key);
    if (values[key] == null && !writable) return undefined;
    return {
      label: label("setpoint"),
      value: format(values[key], digits, units[key]),
      onEdit: writable ? () => onEdit(key) : undefined,
      editLabel: `${tCommon("common.edit")} ${label(key)}`,
    };
  };

  const pressure = (
    stream: "supplyAir" | "extractAir",
    key: AhuReadingKey,
    setpointKey: AhuSetpointKey,
  ): StreamRow | null => {
    const target = setpoint(setpointKey, PRESSURE_DIGITS);
    if (values[key] == null && !target) return null;
    return {
      kind: "P",
      title: `${label(stream)} · ${label("pressure")}`,
      value: format(values[key], PRESSURE_DIGITS, units[key]),
      setpoint: target,
    };
  };

  const supplyPressure = pressure(
    "supplyAir",
    "supplyAirPressure",
    "supplyAirPressureSetpoint",
  );
  const extractPressure = pressure(
    "extractAir",
    "extractAirPressure",
    "extractAirPressureSetpoint",
  );

  const optional = (row: StreamRow, value: number | null | undefined) =>
    value == null ? [] : [row];

  return {
    fresh: optional(
      temperature("freshAir", "outdoorAirTemperature"),
      values.outdoorAirTemperature,
    ),
    supply: [
      {
        ...temperature("supplyAir", "supplyAirTemperature"),
        setpoint: setpoint("supplyAirTemperatureSetpoint", TEMPERATURE_DIGITS),
      },
      ...(supplyPressure ? [supplyPressure] : []),
    ],
    extract: [
      temperature("extractAir", "extractAirTemperature"),
      ...(extractPressure ? [extractPressure] : []),
    ],
    exhaust: optional(
      temperature("exhaustAir", "exhaustAirTemperature"),
      values.exhaustAirTemperature,
    ),
  };
}

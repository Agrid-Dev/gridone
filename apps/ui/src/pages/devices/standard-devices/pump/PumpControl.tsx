import { useTranslation } from "react-i18next";
import { isPump, readPumpAttributes } from "@/lib/devices";
import { attributeUnit } from "@/lib/attributeUnits";
import { fmt } from "@/lib/formatValue";
import { PumpSynoptic } from "./PumpSynoptic";
import type { PumpFieldKey, PumpValues } from "./types";
import type { StandardControlProps } from "../types";

/** Readings with no place on a hydraulic drawing: settings, electrical
 *  detail and life counters. Pinning these to a spot on the pump would be
 *  decoration, so they get a tile grid instead — in scan order: what the pump
 *  is asked to do, then what it draws, then how hard it has worked. */
const TILES: {
  key: keyof PumpValues;
  attribute: PumpFieldKey;
  digits: number;
}[] = [
  { key: "controlMode", attribute: "control_mode", digits: 0 },
  { key: "setpoint", attribute: "setpoint", digits: 1 },
  { key: "actualSetpoint", attribute: "actual_setpoint", digits: 1 },
  { key: "motorCurrent", attribute: "motor_current", digits: 2 },
  { key: "motorVoltage", attribute: "motor_voltage", digits: 0 },
  { key: "energy", attribute: "energy", digits: 1 },
  { key: "operatingHours", attribute: "operating_hours", digits: 0 },
  { key: "starts", attribute: "starts", digits: 0 },
];

/** A pump exposes nothing writable through the standard schema, so the
 *  control is a read-only plant view: the synoptic, then whichever secondary
 *  readings this pump actually reports. A dry-contact pump renders the
 *  synoptic alone — no empty scaffolding. */
export function PumpControl({ device }: StandardControlProps) {
  const { t } = useTranslation("standardDevices");

  if (!isPump(device)) return null;
  const values = readPumpAttributes(device);
  const tiles = TILES.filter((tile) => values[tile.key] != null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <PumpSynoptic values={values} />

      {tiles.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => {
            const unit = attributeUnit(tile.attribute);
            return (
              <div
                key={tile.key}
                className="rounded-xl border bg-card p-3 shadow-sm"
              >
                <dt className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t(`pump.field.${tile.attribute}`)}
                </dt>
                <dd className="mt-1 truncate text-lg font-medium tabular-nums text-card-foreground">
                  {typeof values[tile.key] === "string"
                    ? (values[tile.key] as string)
                    : fmt(values[tile.key] as number, tile.digits)}
                  {unit && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {unit}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

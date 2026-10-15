import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AwhpAttributes } from "@/lib/devices";
import { useReadingFormat } from "@/hooks/useReadingFormat";
import { cn } from "@/lib/utils";
import figureSvg from "./figure/awhp-figure.svg?raw";
import figureData from "./figure/awhp-figure.json";
import "./figure/awhp-figure.css";
import {
  figureMode,
  isRunning,
  sensorAttribute,
  SENSOR_PIECES,
  parseFigureData,
  type SensorPiece,
} from "./figureModel";
import { useAwhpFigure, type AwhpFigureState } from "./useAwhpFigure";
import { AWHP_CONVENTION_UNITS, type AwhpUnits } from "./units";

const DATA = parseFigureData(figureData);
const READING_DIGITS = 1;

export type AwhpFigureProps = {
  values: AwhpAttributes;
  /** Display unit per reading: the driver's where it declares one, else
   *  the name convention (the default). */
  units?: AwhpUnits;
  className?: string;
};

/**
 * The ideal air-to-water heat pump as a live isometric figure: finned coil
 * and fan, compressor under its four-way reversing valve, plate exchanger
 * with the water in and out, expansion valve on the liquid line, and one
 * sensor per standard attribute. Lines and exchangers are coloured by
 * refrigerant temperature for the mode, the flow dashes and the fan move
 * while the unit runs, and a sensor the device does not report loses its
 * tag. The drawing is generated (see `figure/`); this component only feeds
 * it.
 */
export default function AwhpFigure({
  values,
  units = AWHP_CONVENTION_UNITS,
  className,
}: AwhpFigureProps) {
  const { t } = useTranslation("devices");
  const format = useReadingFormat();
  const root = useRef<HTMLDivElement>(null);

  const mode = figureMode(values.mode);
  const running = isRunning(values);
  const readings = useMemo(() => {
    const out = {} as Record<SensorPiece, string | null>;
    for (const piece of SENSOR_PIECES) {
      const attribute = sensorAttribute(piece, mode);
      const value = values[attribute];
      out[piece] =
        value == null ? null : format(value, READING_DIGITS, units[attribute]);
    }
    return out;
  }, [format, mode, units, values]);
  const names = useMemo<AwhpFigureState["names"]>(
    () => ({
      air: t("controls.awhp.fanCoil"),
      compressor: t("controls.awhp.compressor"),
      valve: t("controls.awhp.reversingValve"),
      eev: t("controls.awhp.expansionValve"),
      water: t("controls.awhp.plateExchanger"),
      inlet_t: t("controls.awhp.waterIn"),
      outlet_t: t("controls.awhp.waterOut"),
      outdoor_t: t("controls.awhp.outdoor"),
    }),
    [t],
  );

  useAwhpFigure(root, {
    data: DATA,
    state: { mode, running, readings, names },
  });

  return (
    <div
      ref={root}
      className={cn("awhp-figure", className)}
      role="img"
      aria-label={t("controls.awhp.figureLabel")}
      data-testid="awhp-figure"
      dangerouslySetInnerHTML={{ __html: figureSvg }}
    />
  );
}

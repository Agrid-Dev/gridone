import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeviceType } from "@/lib/devices";
import { DUCT_HEIGHT } from "@/components/synoptic/duct";
import {
  AHU_CONVENTION_UNITS,
  AhuSetpointEditor,
  AhuStatusBadges,
  ExchangerGlyph,
  ExtractRun,
  SupplyRun,
  SynopticCard,
  useAhuStreams,
  useAhuSynopticLabel,
  useReadingFormat,
  VIEW_WIDTH,
  type AhuSetpointKey,
  type AhuUnits,
} from "../ahu-shared";
import type { AhuDoubleFluxValues } from "./types";

type AhuDoubleFluxSynopticProps = {
  values: AhuDoubleFluxValues;
  /** Display unit per reading: the driver's where it declares one, else
   *  the name convention (the default). */
  units?: AhuUnits;
  /** Setpoints the current device accepts writes for; the others render
   *  read-only. */
  writableSetpoints?: readonly AhuSetpointKey[];
  onSetpointSave?: (key: AhuSetpointKey, value: number) => void | Promise<void>;
  className?: string;
};

const EXTRACT_Y = 70;
const SUPPLY_Y = 184;
const VIEW_HEIGHT = 300;
/** The exchanger overhangs both ducts by this much. */
const EXCHANGER_MARGIN = 18;

/** Flat 2D synoptic of a double-flux AHU: extract run on top (right to
 *  left), supply run below (left to right), a heat-recovery exchanger where
 *  the two streams cross. Stream properties read at the duct ends,
 *  equipment readings under their equipment, setpoints beside their
 *  process value. */
export function AhuDoubleFluxSynoptic({
  values,
  units = AHU_CONVENTION_UNITS,
  writableSetpoints = [],
  onSetpointSave,
  className,
}: AhuDoubleFluxSynopticProps) {
  const { t } = useTranslation("standardDevices");
  const label = useAhuSynopticLabel();
  const format = useReadingFormat();
  const [editing, setEditing] = useState<AhuSetpointKey | null>(null);
  const streams = useAhuStreams({
    values,
    units,
    writableSetpoints,
    onEdit: setEditing,
  });

  return (
    <SynopticCard
      className={className}
      rail={
        <AhuStatusBadges
          deviceType={DeviceType.AhuDoubleFlux}
          onoffState={values.onoffState}
          hvacMode={values.hvacMode}
        />
      }
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={t("ahu_double_flux.name")}
        className="w-full"
      >
        <ExtractRun
          y={EXTRACT_Y}
          values={values}
          units={units}
          extract={streams.extract}
          exhaust={streams.exhaust}
        />
        <SupplyRun
          y={SUPPLY_Y}
          values={values}
          units={units}
          fresh={streams.fresh}
          supply={streams.supply}
        />
        <ExchangerGlyph
          cx={VIEW_WIDTH / 2 - 40}
          y={EXTRACT_Y - EXCHANGER_MARGIN}
          height={
            SUPPLY_Y +
            DUCT_HEIGHT +
            EXCHANGER_MARGIN -
            (EXTRACT_Y - EXCHANGER_MARGIN)
          }
          title={label("exchanger")}
          readout={{
            label: label("exchanger"),
            value: format(
              values.exchangerUtilization,
              0,
              units.exchangerUtilization,
            ),
          }}
        />
      </svg>

      <AhuSetpointEditor
        editing={editing}
        values={values}
        onClose={() => setEditing(null)}
        onSave={onSetpointSave}
      />
    </SynopticCard>
  );
}

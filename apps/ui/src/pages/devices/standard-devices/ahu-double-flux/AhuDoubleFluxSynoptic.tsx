import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeviceType } from "@/lib/devices";
import { DUCT_HEIGHT, streamBlockLines } from "@/components/synoptic/duct";
import {
  AHU_CONVENTION_UNITS,
  ahuLayout,
  AhuSetpointEditor,
  AhuStatusBadges,
  ExchangerGlyph,
  ExtractRun,
  hasCoilLoop,
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

/** The exchanger overhangs both ducts by this much. */
const EXCHANGER_MARGIN = 18;
/** Left of centre, clear of the heating coil's water loop readings. */
const EXCHANGER_CX = VIEW_WIDTH / 2 - 75;
const RATIO_DIGITS = 0;

/** Flat 2D synoptic of a double-flux AHU: extract run on top (right to
 *  left), supply run below (left to right), a heat-recovery exchanger where
 *  the two streams cross. Stream properties read at the duct ends,
 *  equipment readings under their equipment, setpoints beside their
 *  process value. The ducts move apart as the stream blocks grow, and a
 *  coil with a measured water loop gets a band under the supply duct. */
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
  const { extractY, supplyY, height } = ahuLayout({
    extractLines: Math.max(1, streamBlockLines(streams.extract)),
    supplyLines: streamBlockLines(streams.supply),
    coilLoop: hasCoilLoop(values),
  });
  const exchangerReadouts = [
    {
      label: label("exchanger"),
      value: format(
        values.exchangerUtilization,
        RATIO_DIGITS,
        units.exchangerUtilization,
      ),
    },
    ...(values.exchangerEfficiency == null
      ? []
      : [
          {
            label: label("efficiency"),
            value: format(
              values.exchangerEfficiency,
              RATIO_DIGITS,
              units.exchangerEfficiency,
            ),
          },
        ]),
  ];

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
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        role="img"
        aria-label={t("ahu_double_flux.name")}
        className="w-full"
      >
        <ExtractRun
          y={extractY}
          values={values}
          units={units}
          extract={streams.extract}
          exhaust={streams.exhaust}
        />
        <SupplyRun
          y={supplyY}
          values={values}
          units={units}
          fresh={streams.fresh}
          supply={streams.supply}
        />
        <ExchangerGlyph
          cx={EXCHANGER_CX}
          y={extractY - EXCHANGER_MARGIN}
          height={
            supplyY +
            DUCT_HEIGHT +
            EXCHANGER_MARGIN -
            (extractY - EXCHANGER_MARGIN)
          }
          title={label("exchanger")}
          readouts={exchangerReadouts}
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

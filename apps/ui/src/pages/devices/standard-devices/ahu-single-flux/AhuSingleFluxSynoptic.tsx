import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DeviceType } from "@/lib/devices";
import { streamBlockLines } from "@/components/synoptic/duct";
import {
  AHU_CONVENTION_UNITS,
  ahuLayout,
  AhuSetpointEditor,
  AhuStatusBadges,
  ExtractRun,
  hasCoilLoop,
  SupplyRun,
  SynopticCard,
  useAhuStreams,
  VIEW_WIDTH,
  type AhuSetpointKey,
  type AhuUnits,
} from "../ahu-shared";
import type { AhuSingleFluxSetpointKey, AhuSingleFluxValues } from "./types";

type AhuSingleFluxSynopticProps = {
  values: AhuSingleFluxValues;
  /** Display unit per reading: the driver's where it declares one, else
   *  the name convention (the default). */
  units?: AhuUnits;
  /** Setpoints the current device accepts writes for; the others render
   *  read-only. */
  writableSetpoints?: readonly AhuSingleFluxSetpointKey[];
  onSetpointSave?: (
    key: AhuSingleFluxSetpointKey,
    value: number,
  ) => void | Promise<void>;
  className?: string;
};

/** Flat 2D synoptic of a single-flux AHU — the supply run alone: fresh air
 *  in, filter, heating/cooling coils, supply fan, supply air out. A unit
 *  that also reports its extract side (temperature, pressure or fan) gets
 *  the extract run above, with no exchanger between the two. */
export function AhuSingleFluxSynoptic({
  values,
  units = AHU_CONVENTION_UNITS,
  writableSetpoints = [],
  onSetpointSave,
  className,
}: AhuSingleFluxSynopticProps) {
  const { t } = useTranslation("standardDevices");
  const [editing, setEditing] = useState<AhuSingleFluxSetpointKey | null>(null);
  const streams = useAhuStreams({
    values,
    units,
    writableSetpoints,
    // Only the single-flux setpoints are ever offered, so the key handed
    // back is one of them.
    onEdit: (key: AhuSetpointKey) =>
      setEditing(key as AhuSingleFluxSetpointKey),
  });

  const hasExtract =
    values.extractAirTemperature != null ||
    values.extractAirPressure != null ||
    values.extractFanSpeed != null;
  const layout = ahuLayout({
    extractLines: hasExtract
      ? Math.max(1, streamBlockLines(streams.extract))
      : 0,
    supplyLines: streamBlockLines(streams.supply),
    coilLoop: hasCoilLoop(values),
  });

  return (
    <SynopticCard
      className={className}
      rail={
        <AhuStatusBadges
          deviceType={DeviceType.AhuSingleFlux}
          onoffState={values.onoffState}
          hvacMode={values.hvacMode}
        />
      }
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${layout.height}`}
        role="img"
        aria-label={t("ahu_single_flux.name")}
        className="w-full"
      >
        {hasExtract && (
          <ExtractRun
            y={layout.extractY}
            values={values}
            units={units}
            extract={streams.extract}
          />
        )}
        <SupplyRun
          y={layout.supplyY}
          values={values}
          units={units}
          fresh={streams.fresh}
          supply={streams.supply}
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

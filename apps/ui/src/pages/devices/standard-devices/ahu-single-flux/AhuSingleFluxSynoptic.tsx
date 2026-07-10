import { useTranslation } from "react-i18next";
import { DeviceType } from "@/lib/devices";
import { cn } from "@/lib/utils";
import {
  AhuSetpointsSection,
  AhuStatusBadges,
  airLine,
  CoilGlyph,
  FanGlyph,
  FilterGlyph,
  FlowChevron,
  fmt,
  MeasureTag,
  useAhuSynopticLabel,
  ValueChip,
  type AhuSetpointSpec,
} from "../ahu-shared";
import type { AhuSingleFluxSetpointKey, AhuSingleFluxValues } from "./types";

type AhuSingleFluxSynopticProps = {
  values: AhuSingleFluxValues;
  /** Setpoints the current device accepts writes for; the others render
   *  read-only. */
  writableSetpoints?: readonly AhuSingleFluxSetpointKey[];
  onSetpointSave?: (
    key: AhuSingleFluxSetpointKey,
    value: number,
  ) => void | Promise<void>;
  className?: string;
};

const SETPOINTS: readonly AhuSetpointSpec<AhuSingleFluxSetpointKey>[] = [
  { key: "supplyAirTemperatureSetpoint", digits: 1, suffix: "°" },
  { key: "supplyAirPressureSetpoint", digits: 0 },
];

const DUCT_Y = 64;
const DUCT_CY = 92;

/** Flat 2D synoptic of a single-flux AHU — the double-flux layout reduced
 *  to its supply duct: fresh air in (left), filter, heating/cooling coils,
 *  supply fan, supply air out (right). No exchanger, no extract duct.
 *  Coils render only when the device exposes the matching valve attribute. */
export function AhuSingleFluxSynoptic({
  values,
  writableSetpoints = [],
  onSetpointSave,
  className,
}: AhuSingleFluxSynopticProps) {
  const { t } = useTranslation("standardDevices");
  const label = useAhuSynopticLabel();

  const hasHeatingCoil = values.heatingValve != null;
  const hasCoolingCoil = values.coolingValve != null;
  // Both coils fit the reserved slot side by side; a lone coil centers in it.
  const heatingCoilX = hasCoolingCoil ? 466 : 490;
  const coolingCoilX = hasHeatingCoil ? 514 : 490;

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <AhuStatusBadges
        deviceType={DeviceType.AhuSingleFlux}
        onoffState={values.onoffState}
        hvacMode={values.hvacMode}
      />

      <svg
        viewBox="0 0 920 172"
        role="img"
        aria-label={t("ahu_single_flux.name")}
        className="w-full"
      >
        {/* Supply duct (flow left→right). Only the walls are stroked — the
            ends stay open. */}
        <rect
          x="40"
          y={DUCT_Y}
          width="840"
          height="56"
          className="fill-muted"
        />
        {[DUCT_Y, DUCT_Y + 56].map((y) => (
          <line
            key={y}
            x1="40"
            y1={y}
            x2="880"
            y2={y}
            strokeWidth="1.5"
            className="stroke-border"
          />
        ))}

        {/* Flow direction */}
        {[230, 340, 620].map((x) => (
          <FlowChevron key={x} x={x} cy={DUCT_CY} dir="right" />
        ))}

        {/* Duct internals */}
        <FilterGlyph x={128} cy={DUCT_CY} title={label("filter")} />
        {hasHeatingCoil && (
          <CoilGlyph
            cx={heatingCoilX}
            ductY={DUCT_Y}
            colorClass="stroke-hvac-heat"
            title={label("heatingCoil")}
            valve={fmt(values.heatingValve, 0, " %")}
          />
        )}
        {hasCoolingCoil && (
          <CoilGlyph
            cx={coolingCoilX}
            ductY={DUCT_Y}
            colorClass="stroke-hvac-cool"
            title={label("coolingCoil")}
            valve={fmt(values.coolingValve, 0, " %")}
          />
        )}
        <FanGlyph
          cx={700}
          cy={DUCT_CY}
          spinning={(values.supplyFanSpeed ?? 0) > 0}
          title={label("supplyFan")}
        />
        <ValueChip
          cx={700}
          cy={DUCT_Y + 84}
          title={label("supplyFan")}
          value={fmt(values.supplyFanSpeed, 0, " %")}
        />

        {/* Air measurement tags at the duct ends */}
        <MeasureTag
          cx={120}
          y={8}
          w={124}
          lineY={[46, DUCT_Y]}
          labelText={label("freshAir")}
          value={fmt(values.outdoorAirTemperature, 1, "°")}
        />
        <MeasureTag
          cx={800}
          y={8}
          w={156}
          lineY={[46, DUCT_Y]}
          labelText={label("supplyAir")}
          value={airLine(values.supplyAirTemperature, values.supplyAirPressure)}
        />
      </svg>

      <AhuSetpointsSection
        setpoints={SETPOINTS}
        values={values}
        writableSetpoints={writableSetpoints}
        onSetpointSave={onSetpointSave}
      />
    </div>
  );
}

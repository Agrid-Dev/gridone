import { useId } from "react";
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
import type { AhuDoubleFluxValues, AhuSetpointKey } from "./types";

type AhuDoubleFluxSynopticProps = {
  values: AhuDoubleFluxValues;
  /** Setpoints the current device accepts writes for; the others render
   *  read-only. */
  writableSetpoints?: readonly AhuSetpointKey[];
  onSetpointSave?: (key: AhuSetpointKey, value: number) => void | Promise<void>;
  className?: string;
};

const SETPOINTS: readonly AhuSetpointSpec<AhuSetpointKey>[] = [
  { key: "supplyAirTemperatureSetpoint", digits: 1, suffix: "°" },
  { key: "supplyAirPressureSetpoint", digits: 0 },
  { key: "extractAirPressureSetpoint", digits: 0 },
];

/** Flat 2D synoptic of a double-flux AHU: extract duct on top (right to
 *  left), supply duct below (left to right), a generic heat-recovery
 *  exchanger where the two streams cross (agnostic to plate vs wheel).
 *  Heating/cooling coils render only when the device exposes the matching
 *  valve attribute. */
export function AhuDoubleFluxSynoptic({
  values,
  writableSetpoints = [],
  onSetpointSave,
  className,
}: AhuDoubleFluxSynopticProps) {
  const { t } = useTranslation("standardDevices");
  const label = useAhuSynopticLabel();
  const exchangerClipId = useId();

  const hasHeatingCoil = values.heatingValve != null;
  const hasCoolingCoil = values.coolingValve != null;
  // Both coils fit the reserved slot side by side; a lone coil centers in it.
  const heatingCoilX = hasCoolingCoil ? 566 : 590;
  const coolingCoilX = hasHeatingCoil ? 614 : 590;

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <AhuStatusBadges
        deviceType={DeviceType.AhuDoubleFlux}
        onoffState={values.onoffState}
        hvacMode={values.hvacMode}
      />

      <svg
        viewBox="0 0 920 336"
        role="img"
        aria-label={t("ahu_double_flux.name")}
        className="w-full"
      >
        {/* Ducts: extract on top (flow right→left), supply below
            (left→right). Only the walls are stroked — the ends stay open. */}
        <rect x="40" y="64" width="840" height="56" className="fill-muted" />
        <rect x="40" y="216" width="840" height="56" className="fill-muted" />
        {[64, 120, 216, 272].map((y) => (
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

        {/* Heat-recovery exchanger (generic — plate or wheel): the two air
            streams cross inside the block. */}
        <g>
          <title>{label("exchanger")}</title>
          <clipPath id={exchangerClipId}>
            <rect x="424" y="46" width="72" height="244" />
          </clipPath>
          <rect
            x="424"
            y="46"
            width="72"
            height="244"
            className="fill-background"
          />
          <g clipPath={`url(#${exchangerClipId})`}>
            <line
              x1="420"
              y1="92"
              x2="500"
              y2="244"
              strokeWidth="32"
              className="stroke-muted"
            />
            <line
              x1="420"
              y1="244"
              x2="500"
              y2="92"
              strokeWidth="32"
              className="stroke-muted"
            />
          </g>
          <rect
            x="424"
            y="46"
            width="72"
            height="244"
            fill="none"
            strokeWidth="1.5"
            className="stroke-border"
          />
        </g>

        {/* Flow direction */}
        {[250, 350, 570].map((x) => (
          <FlowChevron key={x} x={x} cy={92} dir="left" />
        ))}
        {[230, 340, 520].map((x) => (
          <FlowChevron key={x} x={x} cy={244} dir="right" />
        ))}

        {/* Extract duct internals */}
        <FilterGlyph x={764} cy={92} title={label("filter")} />
        <FanGlyph
          cx={680}
          cy={92}
          spinning={(values.extractFanSpeed ?? 0) > 0}
          title={label("extractFan")}
        />
        <ValueChip
          cx={680}
          cy={139}
          title={label("extractFan")}
          value={fmt(values.extractFanSpeed, 0, " %")}
        />

        {/* Supply duct internals */}
        <FilterGlyph x={128} cy={244} title={label("filter")} />
        {hasHeatingCoil && (
          <CoilGlyph
            cx={heatingCoilX}
            ductY={216}
            colorClass="stroke-hvac-heat"
            title={label("heatingCoil")}
            valve={fmt(values.heatingValve, 0, " %")}
          />
        )}
        {hasCoolingCoil && (
          <CoilGlyph
            cx={coolingCoilX}
            ductY={216}
            colorClass="stroke-hvac-cool"
            title={label("coolingCoil")}
            valve={fmt(values.coolingValve, 0, " %")}
          />
        )}
        <FanGlyph
          cx={700}
          cy={244}
          spinning={(values.supplyFanSpeed ?? 0) > 0}
          title={label("supplyFan")}
        />
        <ValueChip
          cx={700}
          cy={195}
          title={label("supplyFan")}
          value={fmt(values.supplyFanSpeed, 0, " %")}
        />

        {/* Exchanger utilization */}
        <ValueChip
          cx={460}
          cy={168}
          w={64}
          title={label("exchanger")}
          value={fmt(values.exchangerUtilization, 0, " %")}
        />

        {/* Air measurement tags at the four duct ends */}
        <MeasureTag
          cx={120}
          y={8}
          w={124}
          lineY={[46, 64]}
          labelText={label("exhaustAir")}
          value={fmt(values.exhaustAirTemperature, 1, "°")}
        />
        <MeasureTag
          cx={800}
          y={8}
          w={156}
          lineY={[46, 64]}
          labelText={label("extractAir")}
          value={airLine(
            values.extractAirTemperature,
            values.extractAirPressure,
          )}
        />
        <MeasureTag
          cx={120}
          y={290}
          w={124}
          lineY={[272, 290]}
          labelText={label("freshAir")}
          value={fmt(values.outdoorAirTemperature, 1, "°")}
        />
        <MeasureTag
          cx={790}
          y={290}
          w={156}
          lineY={[272, 290]}
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

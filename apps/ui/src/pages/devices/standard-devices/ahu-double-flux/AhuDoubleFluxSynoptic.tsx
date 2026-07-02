import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { DeviceType } from "@/api/devices";
import { AttributeValue } from "@/components/AttributeValue";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SetpointDialog } from "./SetpointDialog";
import type { AhuDoubleFluxValues, AhuSetpointKey } from "./types";

type AhuDoubleFluxSynopticProps = {
  values: AhuDoubleFluxValues;
  /** Setpoints the current device accepts writes for; the others render
   *  read-only. */
  writableSetpoints?: readonly AhuSetpointKey[];
  onSetpointSave?: (key: AhuSetpointKey, value: number) => void | Promise<void>;
  className?: string;
};

type SynopticLabelKey =
  | "freshAir"
  | "exhaustAir"
  | "extractAir"
  | "supplyAir"
  | "exchanger"
  | "filter"
  | "supplyFan"
  | "extractFan"
  | "heatingCoil"
  | "coolingCoil"
  | "on"
  | "off"
  | "setpoints"
  | AhuSetpointKey;

const SETPOINTS: { key: AhuSetpointKey; digits: number; suffix?: string }[] = [
  { key: "supplyAirTemperatureSetpoint", digits: 1, suffix: "°" },
  { key: "supplyAirPressureSetpoint", digits: 0 },
  { key: "extractAirPressureSetpoint", digits: 0 },
];

/** No physical units yet — devices don't declare them, so we can't assume
 *  any. Temperatures get a scale-agnostic `°` like the other standard
 *  device views; `%` stays because it is a ratio, not a physical unit. */
function fmt(
  value: number | null | undefined,
  digits = 0,
  suffix = "",
): string {
  if (value == null) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

/** "23.1° · 82" — pressure omitted when the field is absent. */
function airLine(
  temperature: number | null | undefined,
  pressure: number | null | undefined,
): string {
  const parts = [fmt(temperature, 1, "°")];
  if (pressure != null) parts.push(fmt(pressure));
  return parts.join(" · ");
}

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
  const { t: tCommon } = useTranslation("common");
  const exchangerClipId = useId();
  const [editing, setEditing] = useState<AhuSetpointKey | null>(null);

  const running = values.onoffState;

  const label = (key: SynopticLabelKey): string =>
    t(`ahu_double_flux.synoptic.${key}`);

  const hasHeatingCoil = values.heatingValve != null;
  const hasCoolingCoil = values.coolingValve != null;
  // Both coils fit the reserved slot side by side; a lone coil centers in it.
  const heatingCoilX = hasCoolingCoil ? 566 : 590;
  const coolingCoilX = hasHeatingCoil ? 614 : 590;

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      {(running != null || values.hvacMode) && (
        <div className="mb-3 flex items-center gap-2">
          {running != null && (
            <Badge variant="outline" className="gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  running ? "bg-status-ok" : "bg-muted-foreground",
                )}
              />
              {running ? label("on") : label("off")}
            </Badge>
          )}
          {values.hvacMode && (
            <Badge variant="outline">
              <AttributeValue
                deviceType={DeviceType.AhuDoubleFlux}
                attributeName="hvac_mode"
                value={values.hvacMode}
              />
            </Badge>
          )}
        </div>
      )}

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

      <div className="mt-4 border-t pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label("setpoints")}
        </p>
        <div className="flex flex-wrap gap-2">
          {SETPOINTS.map(({ key, digits, suffix }) => {
            const value = values[key];
            const writable = writableSetpoints.includes(key);
            if (value == null && !writable) return null;
            const content = (
              <>
                <span className="text-muted-foreground">{label(key)}</span>
                <span className="font-semibold text-foreground">
                  {fmt(value, digits, suffix)}
                </span>
              </>
            );
            return writable ? (
              <button
                key={key}
                type="button"
                onClick={() => setEditing(key)}
                aria-label={`${tCommon("common.edit")} ${label(key)}`}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent"
              >
                {content}
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ) : (
              <div
                key={key}
                title={tCommon("common.readOnly")}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm"
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <SetpointDialog
          label={label(editing)}
          currentValue={values[editing] ?? null}
          onClose={() => setEditing(null)}
          onSave={async (value) => {
            await onSetpointSave?.(editing, value);
          }}
        />
      )}
    </div>
  );
}

function FlowChevron({
  x,
  cy,
  dir,
}: {
  x: number;
  cy: number;
  dir: "left" | "right";
}) {
  const tip = dir === "left" ? x - 6 : x + 6;
  const base = dir === "left" ? x + 6 : x - 6;
  return (
    <path
      d={`M ${base} ${cy - 8} L ${tip} ${cy} L ${base} ${cy + 8}`}
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-muted-foreground"
    />
  );
}

function FanGlyph({
  cx,
  cy,
  spinning,
  title,
}: {
  cx: number;
  cy: number;
  spinning: boolean;
  title: string;
}) {
  return (
    <g>
      <title>{title}</title>
      <circle
        cx={cx}
        cy={cy}
        r="24"
        strokeWidth="1.5"
        className="fill-background stroke-border"
      />
      {/* Blades are drawn around the local origin; the SMIL rotation is
          additive so it composes with the translate and spins in place. */}
      <g
        transform={`translate(${cx} ${cy})`}
        className={spinning ? "fill-hvac-fan" : "fill-muted-foreground"}
      >
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle})`}
            d="M0 -4 C7 -7 8 -17 0 -20 C-8 -17 -7 -7 0 -4 Z"
          />
        ))}
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0"
            to="360"
            dur="2.6s"
            repeatCount="indefinite"
            additive="sum"
          />
        )}
      </g>
      <circle cx={cx} cy={cy} r="3.5" className="fill-border" />
    </g>
  );
}

function FilterGlyph({
  x,
  cy,
  title,
}: {
  x: number;
  cy: number;
  title: string;
}) {
  const mid = x + 13;
  const zigzag = [-22, -15, -8, -1, 6, 13, 20]
    .map((dy, i) => `${i % 2 === 0 ? mid - 5 : mid + 5},${cy + dy}`)
    .join(" ");
  return (
    <g>
      <title>{title}</title>
      <rect
        x={x}
        y={cy - 26}
        width="26"
        height="52"
        rx="3"
        className="fill-background stroke-border"
      />
      <polyline
        points={zigzag}
        fill="none"
        strokeWidth="1.5"
        className="stroke-muted-foreground"
      />
    </g>
  );
}

/** Heating or cooling battery in the supply duct, with its valve position
 *  tagged below the duct. */
function CoilGlyph({
  cx,
  ductY,
  colorClass,
  title,
  valve,
}: {
  cx: number;
  ductY: number;
  colorClass: string;
  title: string;
  valve: string;
}) {
  const y = ductY + 4;
  return (
    <g>
      <title>{title}</title>
      <rect
        x={cx - 14}
        y={y}
        width="28"
        height="48"
        rx="2"
        strokeWidth="1.5"
        className={cn("fill-background", colorClass)}
      />
      {[-7, 0, 7].map((dx) => (
        <line
          key={dx}
          x1={cx + dx}
          y1={y + 5}
          x2={cx + dx}
          y2={y + 43}
          strokeWidth="1.5"
          className={colorClass}
        />
      ))}
      <line
        x1={cx}
        y1={ductY + 56}
        x2={cx}
        y2={ductY + 73}
        strokeWidth="1.5"
        className="stroke-border"
      />
      <ValueChip cx={cx} cy={ductY + 84} w={46} title={title} value={valve} />
    </g>
  );
}

function ValueChip({
  cx,
  cy,
  value,
  title,
  w = 56,
}: {
  cx: number;
  cy: number;
  value: string;
  title: string;
  w?: number;
}) {
  return (
    <g>
      <title>{title}</title>
      <rect
        x={cx - w / 2}
        y={cy - 11}
        width={w}
        height="22"
        rx="11"
        className="fill-background stroke-border"
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        className="fill-foreground text-[11px] font-semibold"
      >
        {value}
      </text>
    </g>
  );
}

function MeasureTag({
  cx,
  y,
  w,
  lineY,
  labelText,
  value,
}: {
  cx: number;
  y: number;
  w: number;
  lineY: [number, number];
  labelText: string;
  value: string;
}) {
  return (
    <g>
      <line
        x1={cx}
        y1={lineY[0]}
        x2={cx}
        y2={lineY[1]}
        strokeWidth="1.5"
        className="stroke-border"
      />
      <rect
        x={cx - w / 2}
        y={y}
        width={w}
        height="38"
        rx="7"
        className="fill-background stroke-border"
      />
      <text
        x={cx}
        y={y + 15}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wider"
      >
        {labelText}
      </text>
      <text
        x={cx}
        y={y + 31}
        textAnchor="middle"
        className="fill-foreground text-[13px] font-semibold"
      >
        {value}
      </text>
    </g>
  );
}

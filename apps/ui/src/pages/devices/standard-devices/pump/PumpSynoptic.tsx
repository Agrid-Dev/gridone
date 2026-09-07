import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { attributeUnit } from "@/lib/attributeUnits";
import { fmt } from "@/lib/formatValue";
import { FlowChevron, MeasureTag } from "../synoptic";
import { PumpGlyph, pumpMotorBox } from "./PumpGlyph";
import { pumpState } from "./state";
import type { PumpFieldKey, PumpValues } from "./types";

const PIPE_TOP = 190;
const PIPE_H = 48;
const PIPE_CY = PIPE_TOP + PIPE_H / 2;
const PIPE_BOTTOM = PIPE_TOP + PIPE_H;
const CX = 460;
const R = 46;
const MOTOR = pumpMotorBox(CX, PIPE_CY, R);
const MOTOR_TAG_Y = 34;
const MOTOR_TAG_BOTTOM = MOTOR_TAG_Y + 38;
/** Where a motor leader turns to run in at the barrel's side. */
const MOTOR_ELBOW_Y = MOTOR.y + MOTOR.h / 2;
const PIPE_TAG_Y = PIPE_BOTTOM + 26;

/** Readings sit where the quantity physically is, not lined up in a row: what
 *  the motor does is tagged at the motor, what the fluid does is tagged in the
 *  pipe, and the suction side is upstream of the discharge side. A number is
 *  only legible if you can see what it measures.
 *
 *  Counters, setpoints and the control mode are deliberately absent — they
 *  have no location on a hydraulic drawing, so they belong in the panel's tile
 *  grid rather than pinned to an arbitrary spot. */
type Placement = {
  key: keyof PumpValues;
  attribute: PumpFieldKey;
  digits: number;
  cx: number;
  band: "motor" | "pipe";
};

const PLACEMENTS: Placement[] = [
  { key: "speed", attribute: "speed", digits: 0, cx: 300, band: "motor" },
  { key: "power", attribute: "power", digits: 0, cx: 620, band: "motor" },
  {
    key: "liquidTemperature",
    attribute: "liquid_temperature",
    digits: 1,
    cx: 180,
    band: "pipe",
  },
  { key: "head", attribute: "head", digits: 1, cx: 630, band: "pipe" },
  {
    key: "volumeFlow",
    attribute: "volume_flow",
    digits: 1,
    cx: 790,
    band: "pipe",
  },
];

export function PumpSynoptic({
  values,
  className,
}: {
  values: PumpValues;
  className?: string;
}) {
  const { t } = useTranslation("standardDevices");
  const state = pumpState(values);
  const running = state === "running";

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <svg
        viewBox="0 0 920 320"
        role="img"
        aria-label={t("pump.name")}
        className="w-full"
      >
        {/* Pipe run, suction left → discharge right. Only the walls are
            stroked; the ends stay open, as on the duct synoptics. */}
        <rect
          x="40"
          y={PIPE_TOP}
          width="840"
          height={PIPE_H}
          className="fill-muted"
        />
        {[PIPE_TOP, PIPE_BOTTOM].map((y) => (
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

        {/* Flow direction — only while the impeller is actually turning. */}
        {running &&
          [150, 250, 670, 770].map((x) => (
            <FlowChevron key={x} x={x} cy={PIPE_CY} dir="right" />
          ))}

        <PumpGlyph
          cx={CX}
          cy={PIPE_CY}
          r={R}
          state={state}
          spinning={running}
          title={t("pump.name")}
        />

        <PipeLabel cx={110} text={t("pump.suction")} />
        <PipeLabel cx={815} text={t("pump.discharge")} />

        {PLACEMENTS.filter((p) => values[p.key] != null).map((placement) => {
          const unit = attributeUnit(placement.attribute);
          const motor = placement.band === "motor";
          return (
            <g key={placement.key}>
              {/* The motor is far narrower than its two tags, so a plain
                  vertical leader would end in empty space beside it. These
                  turn and run in at the barrel's side, as an annotated
                  drawing does. */}
              {motor && <MotorLeader cx={placement.cx} />}
              <MeasureTag
                cx={placement.cx}
                y={motor ? MOTOR_TAG_Y : PIPE_TAG_Y}
                w={140}
                lineY={
                  motor
                    ? [MOTOR_TAG_BOTTOM, MOTOR_TAG_BOTTOM]
                    : [PIPE_BOTTOM, PIPE_TAG_Y]
                }
                labelText={t(`pump.field.${placement.attribute}`)}
                value={`${fmt(values[placement.key] as number, placement.digits)}${
                  unit ? ` ${unit}` : ""
                }`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Down from the tag, then in to whichever side of the motor is nearer. */
function MotorLeader({ cx }: { cx: number }) {
  const side = cx < CX ? MOTOR.x : MOTOR.x + MOTOR.w;
  return (
    <polyline
      points={`${cx},${MOTOR_TAG_BOTTOM} ${cx},${MOTOR_ELBOW_Y} ${side},${MOTOR_ELBOW_Y}`}
      fill="none"
      strokeWidth="1.5"
      className="stroke-border"
    />
  );
}

/** A small uppercase label above a pipe end, with a tick down to the pipe. */
function PipeLabel({ cx, text }: { cx: number; text: string }) {
  return (
    <g>
      <line
        x1={cx}
        y1={PIPE_TOP - 20}
        x2={cx}
        y2={PIPE_TOP}
        strokeWidth="1.5"
        className="stroke-border"
      />
      <text
        x={cx}
        y={PIPE_TOP - 28}
        textAnchor="middle"
        className="fill-muted-foreground text-[11px] font-medium uppercase tracking-wider"
      >
        {text}
      </text>
    </g>
  );
}

import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FanGlyph, FlowChevron, fmt, ValueChip } from "../synoptic";
import { fanIsSpinning } from "./fan";
import { useAirExtractorLabel } from "./labels";
import type { AirExtractorValues } from "./types";

type AirExtractorSynopticProps = {
  values: AirExtractorValues;
  className?: string;
};

const DUCT_TOP = 64;
const DUCT_CY = 92;

/** Flat 2D synoptic of an air extractor: a single duct pulling room air
 *  (extract) through a fan and out (exhaust). No coils or sensors — the
 *  schema only exposes running state, fan speed and a flow switch. */
export function AirExtractorSynoptic({
  values,
  className,
}: AirExtractorSynopticProps) {
  const { t } = useTranslation("standardDevices");
  const label = useAirExtractorLabel();

  const running = values.onoffState;
  const flow = values.flowSwitch;

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      {(running != null || flow != null) && (
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
          {flow != null && (
            <Badge variant="outline" className="gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  flow ? "bg-status-ok" : "bg-status-warning",
                )}
              />
              {flow ? label("flowProven") : label("flowMissing")}
            </Badge>
          )}
        </div>
      )}

      <svg
        viewBox="0 0 920 172"
        role="img"
        aria-label={t("air_extractor.name")}
        className="w-full"
      >
        {/* Duct (flow left→right). Only the walls are stroked — the ends
            stay open. */}
        <rect
          x="40"
          y={DUCT_TOP}
          width="840"
          height="56"
          className="fill-muted"
        />
        {[DUCT_TOP, DUCT_TOP + 56].map((y) => (
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
        {[210, 320, 600, 710].map((x) => (
          <FlowChevron key={x} x={x} cy={DUCT_CY} dir="right" />
        ))}

        {/* Extract fan */}
        <FanGlyph
          cx={460}
          cy={DUCT_CY}
          spinning={fanIsSpinning(values)}
          title={label("fan")}
        />
        <ValueChip
          cx={460}
          cy={DUCT_TOP + 84}
          title={label("fan")}
          value={fmt(values.fanSpeed, 0, " %")}
        />

        {/* Duct-end flow labels */}
        <DuctLabel cx={120} text={label("extractAir")} />
        <DuctLabel cx={800} text={label("exhaustAir")} />
      </svg>
    </div>
  );
}

/** A small uppercase label above a duct end, with a tick down to the duct. */
function DuctLabel({ cx, text }: { cx: number; text: string }) {
  return (
    <g>
      <line
        x1={cx}
        y1={46}
        x2={cx}
        y2={DUCT_TOP}
        strokeWidth="1.5"
        className="stroke-border"
      />
      <text
        x={cx}
        y={38}
        textAnchor="middle"
        className="fill-muted-foreground text-[11px] font-medium uppercase tracking-wider"
      >
        {text}
      </text>
    </g>
  );
}

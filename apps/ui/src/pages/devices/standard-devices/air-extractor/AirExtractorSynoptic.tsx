import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FanGlyph } from "@/components/synoptic/glyphs";
import {
  Duct,
  DUCT_HEIGHT,
  DuctCaption,
  Readout,
  SynopticCard,
} from "@/components/synoptic/duct";
import { useReadingFormat } from "../ahu-shared";
import { FAN_STATUS_DOT_CLASS, fanIsSpinning, fanStatus } from "./fan";
import { useAirExtractorLabel } from "./labels";
import type { AirExtractorValues } from "./types";

type AirExtractorSynopticProps = {
  values: AirExtractorValues;
  /** Display unit of the fan speed (driver-declared or app convention). */
  fanSpeedUnit?: string | null;
  className?: string;
};

const VIEW_WIDTH = 1100;
const DUCT_X = 150;
const DUCT_WIDTH = 800;
const DUCT_Y = 24;
const DUCT_CY = DUCT_Y + DUCT_HEIGHT / 2;
const FAN_CX = 550;
const FLOW_SWITCH_CX = 300;
const READOUT_Y = DUCT_Y + DUCT_HEIGHT + 24;
/** Height with the readout line under the duct, and without it. */
const VIEW_HEIGHT = READOUT_Y + 30;
const VIEW_HEIGHT_BARE = DUCT_Y + DUCT_HEIGHT + 24;

/** Flat 2D synoptic of an air extractor: a single duct pulling room air
 *  (extract) through a fan and out (exhaust). What the unit reports reads
 *  under the duct: the flow switch upstream of the fan, the fan speed
 *  under the fan. */
export function AirExtractorSynoptic({
  values,
  fanSpeedUnit = "%",
  className,
}: AirExtractorSynopticProps) {
  const { t } = useTranslation("standardDevices");
  const label = useAirExtractorLabel();
  const format = useReadingFormat();

  const status = fanStatus(values);
  const spinning = fanIsSpinning(values);
  // A fan proven turning without a reported speed still moves the air.
  const flowSpeed = values.fanSpeed ?? (spinning ? 100 : 0);
  const hasReadouts = values.fanSpeed != null || values.flowSwitch != null;

  return (
    <SynopticCard
      className={className}
      rail={
        status && (
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  FAN_STATUS_DOT_CLASS[status.tone],
                )}
              />
              {label(status.key)}
            </Badge>
          </div>
        )
      }
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${hasReadouts ? VIEW_HEIGHT : VIEW_HEIGHT_BARE}`}
        role="img"
        aria-label={t("air_extractor.name")}
        className="w-full"
      >
        <Duct
          x={DUCT_X}
          y={DUCT_Y}
          width={DUCT_WIDTH}
          dir="right"
          speed={flowSpeed}
        />
        <FanGlyph
          cx={FAN_CX}
          cy={DUCT_CY}
          spinning={spinning}
          title={label("fan")}
        />
        {values.fanSpeed != null && (
          <Readout
            cx={FAN_CX}
            y={READOUT_Y}
            label={label("fan")}
            value={format(values.fanSpeed, 0, fanSpeedUnit)}
          />
        )}
        {values.flowSwitch != null && (
          <Readout
            cx={FLOW_SWITCH_CX}
            y={READOUT_Y}
            label={label("flowSwitch")}
            value={
              values.flowSwitch ? label("flowProven") : label("flowMissing")
            }
            valueClass={
              values.flowSwitch ? "fill-foreground" : "fill-muted-foreground"
            }
            textual
          />
        )}
        <DuctCaption x={24} cy={DUCT_CY} text={label("extractAir")} />
        <DuctCaption x={968} cy={DUCT_CY} text={label("exhaustAir")} />
      </svg>
    </SynopticCard>
  );
}

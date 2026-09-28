import { useTranslation } from "react-i18next";
import { useInViewOnce } from "@/hooks/useInViewOnce";
import {
  deviceMeasureReading,
  deviceSetpointReading,
  formatReading,
} from "@/lib/deviceSummary";
import { DeviceSparkline } from "../DeviceSparkline";
import type { StandardFleetSummaryProps } from "./types";

/**
 * The fleet card's lead slot for a type whose state is a number: the setpoint
 * (or the primary measure when there is no setpoint) with the live reading
 * beside it and its last-day trend. Also the fallback for devices of no
 * registered type, which read as an em dash.
 */
export function ReadingFleetSummary({ device }: StandardFleetSummaryProps) {
  const { t, i18n } = useTranslation("devices");
  const [ref, inView] = useInViewOnce<HTMLDivElement>({
    rootMargin: "200px",
  });

  const measure = deviceMeasureReading(device);
  const setpoint = deviceSetpointReading(device);
  const lead = setpoint?.value != null ? setpoint : measure;
  const showMeasuredBeside = setpoint?.value != null && measure?.value != null;

  return (
    <div ref={ref} className="flex items-end gap-3">
      <div className="min-w-0">
        <span className="font-display text-2xl font-semibold tabular-nums text-card-foreground">
          {formatReading(lead, i18n.language)}
        </span>
        {showMeasuredBeside && (
          <span className="ml-2 truncate text-xs text-muted-foreground">
            {t("devices.card.measured", {
              value: formatReading(measure, i18n.language),
            })}
          </span>
        )}
      </div>
      <div className="ml-auto w-20 shrink-0">
        {inView && measure && (
          <DeviceSparkline
            deviceId={device.id}
            metric={measure.metric}
            label={t("devices.card.trendLabel")}
          />
        )}
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { STATUS_LEVEL } from "@/components/ConnectionStatusBadge";
import { ConnectionStatus } from "@/lib/devices";
import type { ConnectionCounts } from "@/lib/deviceSummary";
import { SEMANTIC_TEXT_CLASS } from "@/lib/semanticColors";
import { cn } from "@/lib/utils";

const SUMMARY_ORDER = [
  ConnectionStatus.Ok,
  ConnectionStatus.Degraded,
  ConnectionStatus.Error,
  ConnectionStatus.Idle,
] as const;

const SUMMARY_KEYS = {
  [ConnectionStatus.Ok]: "devices.summary.ok",
  [ConnectionStatus.Degraded]: "devices.summary.degraded",
  [ConnectionStatus.Error]: "devices.summary.error",
  [ConnectionStatus.Idle]: "devices.summary.idle",
} as const;

/** "49 appareils · 47 connectés · 1 dégradé · 1 déconnecté" — connection
 *  buckets at zero are omitted, each colored by its semantic status level. */
export function DevicesSummary({
  total,
  counts,
}: {
  total: number;
  counts: ConnectionCounts;
}) {
  const { t } = useTranslation("devices");

  return (
    <span>
      <span className="font-medium text-foreground">
        {t("devices.summary.deviceCount", { count: total })}
      </span>
      {SUMMARY_ORDER.filter((status) => counts[status] > 0).map((status) => (
        <span key={status}>
          {" · "}
          <span
            className={cn(
              "font-medium",
              SEMANTIC_TEXT_CLASS[STATUS_LEVEL[status]],
            )}
          >
            {t(SUMMARY_KEYS[status], { count: counts[status] })}
          </span>
        </span>
      ))}
    </span>
  );
}

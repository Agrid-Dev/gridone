import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePermissions } from "@/contexts/AuthContext";
import { useFaultEpisodes } from "@/hooks/useFaultEpisodes";
import { countByAlert } from "./history/faultHistory";

/** The span over which the ongoing list counts how often an alert came back. */
const RECURRENCE_SPAN = "7d";
const RECURRENCE_PARAMS = { last: RECURRENCE_SPAN };

/** "3 fois sur 7 jours" for each alert that came back over the last 7 days,
 *  keyed by `faultKey`: a note for the ongoing list. Nothing for an alert seen
 *  once, nor for a role that cannot read the series episodes are rebuilt
 *  from. */
export function useRecurrenceNotes(): ReadonlyMap<string, string> {
  const { t } = useTranslation("faults");
  const can = usePermissions();
  const { episodes, truncated, error } = useFaultEpisodes(RECURRENCE_PARAMS, {
    enabled: can("timeseries:read"),
  });
  return useMemo(() => {
    if (truncated || error) return new Map<string, string>();
    const span = t(`faults.span.${RECURRENCE_SPAN}`);
    return new Map(
      [...countByAlert(episodes)]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => [key, t("faults.recurrence", { count, span })]),
    );
  }, [episodes, truncated, error, t]);
}

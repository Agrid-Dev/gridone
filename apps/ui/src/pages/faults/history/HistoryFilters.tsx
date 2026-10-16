import { useTranslation } from "react-i18next";
import type { Severity } from "@gridone/sdk";
import { TimeRangeSegments } from "@/components/TimeRangeSegments";
import { TypeFilterChips } from "@/components/TypeFilterChips";
import { DeviceSearchField } from "@/pages/devices/DeviceSearchField";
import type { FaultHistory } from "./useFaultHistory";

/** The period, the severity and the search the history is read through. */
export function HistoryFilters({ history }: { history: FaultHistory }) {
  const { t } = useTranslation("faults");
  const { timeRange, applyRange, applyPreset, allRows, severity, setSeverity } =
    history;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <TimeRangeSegments
        timeRange={timeRange}
        applyRange={applyRange}
        applyPreset={applyPreset}
      />
      <TypeFilterChips
        options={history.severityOptions}
        total={history.truncated ? undefined : allRows.length}
        allLabel={t("faults.history.severities.all")}
        ariaLabel={t("faults.history.severities.label")}
        selectedKey={severity ?? null}
        onSelect={(key) => setSeverity((key as Severity | null) ?? undefined)}
      />
      <div className="w-full sm:ml-auto sm:w-auto">
        <DeviceSearchField
          label={t("faults.history.search.label")}
          placeholder={t("faults.history.search.placeholder")}
        />
      </div>
    </div>
  );
}

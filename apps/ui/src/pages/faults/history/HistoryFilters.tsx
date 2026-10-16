import { useTranslation } from "react-i18next";
import type { Severity } from "@gridone/sdk";
import { TimeRangeSegments } from "@/components/TimeRangeSegments";
import { TypeFilterChips } from "@/components/TypeFilterChips";
import { SEVERITIES } from "@/lib/severity";
import { capitalize } from "@/lib/textFormat";
import { DeviceSearchField } from "@/pages/devices/DeviceSearchField";
import type { FaultHistory } from "./useFaultHistory";

/** Worst first, as everywhere alerts are listed. */
const SEVERITY_ORDER = [...SEVERITIES].reverse();

/** The period, the severity and the search the history is read through. */
export function HistoryFilters({ history }: { history: FaultHistory }) {
  const { t, i18n } = useTranslation("faults");
  const { t: tCommon } = useTranslation();
  const { timeRange, applyRange, applyPreset, allRows, severity, setSeverity } =
    history;

  const options = SEVERITY_ORDER.map((value) => ({
    key: value,
    label: capitalize(tCommon(`common.severity.${value}`), i18n.language),
    count: allRows.filter((row) => row.severity === value).length,
  })).filter((option) => option.count > 0 || option.key === severity);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <TimeRangeSegments
        timeRange={timeRange}
        applyRange={applyRange}
        applyPreset={applyPreset}
      />
      <TypeFilterChips
        options={options}
        total={allRows.length}
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

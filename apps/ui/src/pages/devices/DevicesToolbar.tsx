import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { FacetFilter } from "@/components/FacetFilter";
import {
  FILTER_PARAMS,
  readHealthParam,
  useSetFilterParams,
} from "@/hooks/useFilterParams";
import type { ConnectionCounts } from "@/lib/deviceSummary";
import {
  DEVICE_TYPE_ORDER,
  deviceTypeBucketLabel,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";
import { DeviceSearchField } from "./DeviceSearchField";
import { DevicesSummary } from "./DevicesSummary";

type DevicesToolbarProps = {
  /** Unfiltered per-type counts. */
  typeCounts: Map<DeviceTypeKey, number>;
  /** Unfiltered fleet size. */
  total: number;
  /** Unfiltered faulty-device count. */
  faultyCount: number;
  /** Devices matching the current filters. */
  shown: number;
  connectionCounts: ConnectionCounts;
  summaryLoading: boolean;
  hasFilters: boolean;
};

/** The devices list's single filter row: name search, type and fault
 *  facets, and the fleet summary. Every control renders whatever the fleet,
 *  so the row keeps its shape across sites and roles. */
export function DevicesToolbar({
  typeCounts,
  total,
  faultyCount,
  shown,
  connectionCounts,
  summaryLoading,
  hasFilters,
}: DevicesToolbarProps) {
  const { t } = useTranslation("devices");
  const { clearAll } = useSetFilterParams();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DeviceSearchField />
      <DeviceTypeFacet counts={typeCounts} />
      <DeviceHealthFacet total={total} faultyCount={faultyCount} />
      {hasFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          {t("devices.filters.reset")}
        </Button>
      )}
      {!summaryLoading && (
        <div className="ml-auto text-sm text-muted-foreground">
          <DevicesSummary
            total={total}
            shown={shown}
            counts={connectionCounts}
          />
        </div>
      )}
    </div>
  );
}

function useFacetLabels() {
  const { t } = useTranslation("devices");
  return {
    searchPlaceholder: t("devices.filters.search"),
    emptyMessage: t("devices.filters.empty"),
    clearLabel: t("devices.filters.clear"),
  };
}

/** Type buckets present in the fleet, plus any bookmarked one that is not,
 *  so it stays visible and clearable. */
function DeviceTypeFacet({ counts }: { counts: Map<DeviceTypeKey, number> }) {
  const { t } = useTranslation("devices");
  const { t: tTypes } = useTranslation("standardDevices");
  const [searchParams] = useSearchParams();
  const { setValues } = useSetFilterParams();
  const labels = useFacetLabels();
  const selected = searchParams.getAll(FILTER_PARAMS.type);

  const options = DEVICE_TYPE_ORDER.filter(
    (key) => (counts.get(key) ?? 0) > 0 || selected.includes(key),
  ).map((key) => ({
    value: key,
    label: deviceTypeBucketLabel(key, tTypes),
    count: counts.get(key) ?? 0,
  }));

  return (
    <FacetFilter
      title={t("devices.filters.type")}
      options={options}
      selected={selected}
      onChange={(next) => setValues(FILTER_PARAMS.type, next)}
      {...labels}
    />
  );
}

const HEALTH_OPTIONS = ["faulty", "healthy"] as const;

/** Faulty / fault-free. Both or neither selected means no filter. */
function DeviceHealthFacet({
  total,
  faultyCount,
}: {
  total: number;
  faultyCount: number;
}) {
  const { t } = useTranslation("devices");
  const [searchParams] = useSearchParams();
  const { setValues } = useSetFilterParams();
  const labels = useFacetLabels();
  const health = readHealthParam(searchParams);
  const counts = { faulty: faultyCount, healthy: total - faultyCount };

  return (
    <FacetFilter
      title={t("devices.filters.health")}
      options={HEALTH_OPTIONS.map((value) => ({
        value,
        label: t(`devices.health.${value}`),
        count: counts[value],
      }))}
      selected={health === "all" ? [] : [health]}
      onChange={(next) =>
        setValues(FILTER_PARAMS.health, next.length === 1 ? next : [])
      }
      summary={
        faultyCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            {faultyCount}
          </span>
        )
      }
      {...labels}
    />
  );
}

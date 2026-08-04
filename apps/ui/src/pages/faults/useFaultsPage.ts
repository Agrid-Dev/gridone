import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FaultView, Severity } from "@gridone/sdk";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useFaultsList } from "@/hooks/useFaultsList";
import { downloadCsv } from "@/lib/csv";
import { faultLabel } from "@/lib/faultLabel";
import { SEVERITIES } from "@/lib/severity";
import { formatDurationSince } from "@/lib/utils";

/** A fault joined with the zone its device sits in — `zone` is null when the
 *  device is attached to no asset. */
export type FaultRow = FaultView & { zone: string | null };

/** How many faults are open at each severity. */
export type SeverityCounts = Record<Severity, number>;

/** Worst first. `SEVERITIES` is ordered mildest-first, so its index doubles as
 *  the severity rank and there is no second ordering to keep in sync. */
function compareRows(a: FaultRow, b: FaultRow): number {
  const bySeverity =
    SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity);
  if (bySeverity !== 0) return bySeverity;
  // Equal severity: the longest-running fault is the more neglected one.
  return Date.parse(a.last_changed) - Date.parse(b.last_changed);
}

/** Stable key for a fault — the API exposes no fault id, and a device can only
 *  hold one fault per attribute. */
export function faultKey(fault: FaultView): string {
  return `${fault.device_id}:${fault.attribute_name}`;
}

/**
 * Everything the faults page renders: rows enriched with their zone, the
 * per-severity counts behind the summary cards, and the CSV export.
 *
 * The zone is joined client-side because `FaultView` carries no location:
 * `useAssetTree` already caches the device-to-asset map for the whole app, so
 * this costs no extra request. Loading is gated on the faults query alone —
 * the tree resolving a beat later fills the zone column in place rather than
 * holding the whole table back.
 */
export function useFaultsPage() {
  const { t } = useTranslation("faults");
  // `formatDurationSince` and the severity labels live in the default
  // (`common`) namespace, which a namespaced `t` would not resolve.
  const { t: tCommon } = useTranslation();
  const { faults, loading, error } = useFaultsList();
  const { assetByDeviceId } = useAssetTree();

  const rows = useMemo<FaultRow[]>(
    () =>
      faults
        .map((fault) => ({
          ...fault,
          zone: assetByDeviceId[fault.device_id]?.name ?? null,
        }))
        .sort(compareRows),
    [faults, assetByDeviceId],
  );

  const counts = useMemo<SeverityCounts>(
    () =>
      rows.reduce<SeverityCounts>(
        (acc, row) => ({ ...acc, [row.severity]: acc[row.severity] + 1 }),
        { info: 0, warning: 0, alert: 0 },
      ),
    [rows],
  );

  const exportCsv = useCallback(() => {
    const header = [
      t("faults.columns.device"),
      t("faults.columns.zone"),
      t("faults.columns.fault"),
      t("faults.columns.severity"),
      t("faults.columns.activeSince"),
      // The rendered duration is relative to the export time, so the raw
      // instant travels alongside it to keep the file self-contained.
      t("faults.columns.since"),
    ];
    const body = rows.map((row) => [
      row.device_name,
      row.zone ?? "",
      faultLabel({
        name: row.attribute_name,
        data_type: row.data_type,
        current_value: row.current_value,
      }),
      tCommon(`common.severity.${row.severity}`),
      formatDurationSince(Date.parse(row.last_changed), tCommon),
      row.last_changed,
    ]);
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(header, body, `${t("faults.exportFilenameStem")}-${day}.csv`);
  }, [rows, t, tCommon]);

  return { rows, counts, loading, error, exportCsv };
}

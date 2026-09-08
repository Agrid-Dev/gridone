import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AssetAssignment } from "@gridone/sdk";
import { useAssetTree } from "@/hooks/useAssetTree";
import {
  ASSET_TAG,
  useDeviceAssetAssignments,
  type AssignmentOutcome,
} from "@/hooks/useDeviceAssetAssignments";
import { useDevicesList } from "@/hooks/useDevicesList";
import { zonePathOf } from "@/lib/assets";
import { downloadCsv } from "@/lib/csv";
import { sortedByName } from "@/lib/sortByName";
import {
  parseZoneMapping,
  TEMPLATE_COLUMNS,
  toAssignments,
  type ParsedMapping,
} from "./zoneMapping";

const TEMPLATE_FILENAME = "zone-mapping.csv";
const ZONES_FILENAME = "zones.csv";
const ZONES_COLUMNS = ["asset_id", "zone"];

/** Upload → preview → apply → results, for the device/zone mapping import.
 *
 *  The file is kept as text rather than as parsed rows: the devices and the
 *  asset tree it is resolved against arrive from their own queries, so a file
 *  dropped before they land still previews correctly once they do — and the
 *  preview follows the fleet afterwards. */
export function useZoneMappingImport() {
  const { devices, loading, error } = useDevicesList();
  const { assetsById, assetsList, isLoading: assetsLoading } = useAssetTree();
  const assign = useDeviceAssetAssignments();

  const [filename, setFilename] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AssignmentOutcome | null>(null);

  const parsed = useMemo<ParsedMapping | null>(
    () =>
      text === null ? null : parseZoneMapping(text, { devices, assetsById }),
    [text, devices, assetsById],
  );

  const invalidRows = parsed?.rows.filter((row) => row.error !== null) ?? [];
  const skippedRows = parsed?.rows.filter((row) => row.skipped) ?? [];
  const assignments = parsed ? toAssignments(parsed.rows) : [];

  const loadFile = async (file: File) => {
    setOutcome(null);
    setFilename(file.name);
    setText(await file.text());
  };

  const reset = () => {
    setOutcome(null);
    setFilename(null);
    setText(null);
  };

  const submit = (batch: AssetAssignment[]) =>
    assign.mutate(batch, {
      onSuccess: setOutcome,
      onError: (err: Error) => toast.error(err.message),
    });

  return {
    /** Devices and zones are both needed to resolve a row into names. */
    loading: loading || assetsLoading,
    error,
    filename,
    parsed,
    invalidRows,
    skippedRows,
    assignments,
    outcome,
    isPending: assign.isPending,
    loadFile,
    reset,
    apply: () => submit(assignments),
    /** Failures are retried alone: the assignments that went through stay
     *  applied, so resending them would only add noise. */
    retryFailed: () =>
      submit(
        (outcome?.failed ?? []).map(({ device_id, asset_id }) => ({
          device_id,
          asset_id,
        })),
      ),
    /** The template is the fleet as it stands: one line per device, its zone
     *  id already filled in. Re-uploading it untouched changes nothing, so
     *  the operator edits the column of the devices they mean to move
     *  instead of transcribing sixteen-character ids by hand. */
    downloadTemplate: () =>
      downloadCsv(
        [...TEMPLATE_COLUMNS],
        sortedByName(devices).map((device) => [
          device.id,
          device.name,
          device.tags?.[ASSET_TAG] ?? "",
        ]),
        TEMPLATE_FILENAME,
      ),
    /** The other half of the answer: the zone ids to paste into that column,
     *  next to the path that says which zone they are. */
    downloadZones: () =>
      downloadCsv(
        ZONES_COLUMNS,
        assetsList
          .map((asset) => [
            asset.id,
            zonePathOf(asset, assetsById) || asset.name,
          ])
          .sort((a, b) => a[1].localeCompare(b[1])),
        ZONES_FILENAME,
      ),
  };
}

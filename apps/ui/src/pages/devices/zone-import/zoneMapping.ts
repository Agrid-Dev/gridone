/**
 * Reading of a device → zone mapping file, ahead of `POST
 * /devices/asset-assignments`.
 *
 * Everything here is pure: the page hands over the file text plus the devices
 * and zones it already has in cache, and gets back one row per line, resolved
 * to readable names and annotated with whatever is wrong with it. Nothing is
 * submitted until every row is clean.
 */
import type { Asset, AssetAssignment, Device } from "@gridone/sdk";
import { ASSET_TAG } from "@/hooks/useDeviceAssetAssignments";
import { zonePathOf } from "@/lib/assets";
import { parseCsv } from "@/lib/csvParse";

/** The two columns the file must carry. Order in an uploaded file is free —
 *  the header names them — and any other column is ignored. */
export const MAPPING_COLUMNS = ["device_id", "asset_id"] as const;

/** What the downloadable template writes: the required pair plus a `name`
 *  column the import ignores and a human needs, since a file of bare hex ids
 *  cannot be checked by eye. */
export const TEMPLATE_COLUMNS = ["device_id", "name", "asset_id"] as const;

/** Something is wrong with the file as a whole; no row could be read. */
export type MappingFileError = "empty" | "missingColumns";

/** Something is wrong with one line. Every value doubles as a translation
 *  key under `devices.zoneImport.rowErrors`. */
export type MappingRowError =
  | "missingDeviceId"
  | "unknownDevice"
  | "unknownZone"
  | "conflictingRows";

export type MappingRow = {
  /** 1-based line in the file, header included — the number the user sees in
   *  their editor, so a reported error is findable. */
  line: number;
  deviceId: string;
  assetId: string;
  deviceName: string | null;
  currentZone: string | null;
  targetZone: string | null;
  /** The row names no zone, so it carries no instruction and is left out of
   *  the batch. Blank never means "unlink": the template ships one line per
   *  device, and the ones the operator did not fill in must stay put. */
  skipped: boolean;
  /** The device already sits in the target zone: applying writes nothing. */
  unchanged: boolean;
  error: MappingRowError | null;
};

export type ParsedMapping = {
  fileError: MappingFileError | null;
  rows: MappingRow[];
};

type RawRow = { line: number; deviceId: string; assetId: string };

type MappingContext = {
  devices: Device[];
  assetsById: Record<string, Asset>;
};

/** Splits the file into raw `(device_id, asset_id)` pairs, locating both
 *  columns by header name so a file may carry them in any order (and carry
 *  extra columns of its own). Blank lines are skipped: a trailing newline or
 *  a spacer row is not a mistake worth reporting. */
function readMappingRows(text: string): {
  fileError: MappingFileError | null;
  raw: RawRow[];
} {
  const table = parseCsv(text);
  if (table.length === 0) return { fileError: "empty", raw: [] };

  const header = table[0].map((name) => name.trim().toLowerCase());
  const [deviceCol, assetCol] = MAPPING_COLUMNS.map((name) =>
    header.indexOf(name),
  );
  if (deviceCol === -1 || assetCol === -1) {
    return { fileError: "missingColumns", raw: [] };
  }

  const raw = table
    .slice(1)
    .map((fields, index) => ({
      line: index + 2,
      deviceId: (fields[deviceCol] ?? "").trim(),
      assetId: (fields[assetCol] ?? "").trim(),
    }))
    .filter((row) => row.deviceId !== "" || row.assetId !== "");

  return { fileError: raw.length === 0 ? "empty" : null, raw };
}

function zoneLabel(
  assetId: string | undefined,
  assetsById: Record<string, Asset>,
): string | null {
  const asset = assetId ? assetsById[assetId] : undefined;
  if (!asset) return null;
  return zonePathOf(asset, assetsById) || asset.name;
}

/** Resolves raw pairs against the devices and zones that exist, and flags
 *  every row that cannot be applied as it stands. Two lines sending the same
 *  device to different zones are contradictory and both are flagged: the file
 *  says nothing about which one wins. */
function resolveMappingRows(
  raw: RawRow[],
  { devices, assetsById }: MappingContext,
): MappingRow[] {
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  // Rows naming no zone say nothing about where their device belongs, so
  // they cannot contradict the row that does.
  const instructions = raw.filter((row) => row.assetId !== "");
  const conflicting = new Set(
    instructions
      .filter((row) =>
        instructions.some(
          (other) =>
            other.deviceId === row.deviceId && other.assetId !== row.assetId,
        ),
      )
      .map((row) => row.deviceId),
  );

  return raw.map((row) => {
    const device = devicesById.get(row.deviceId);
    const currentZone = zoneLabel(device?.tags?.[ASSET_TAG], assetsById);
    const targetZone = zoneLabel(row.assetId, assetsById);
    const skipped = row.deviceId !== "" && row.assetId === "";

    const error: MappingRowError | null =
      row.deviceId === ""
        ? "missingDeviceId"
        : skipped
          ? null
          : conflicting.has(row.deviceId)
            ? "conflictingRows"
            : !device
              ? "unknownDevice"
              : targetZone === null
                ? "unknownZone"
                : null;

    return {
      line: row.line,
      deviceId: row.deviceId,
      assetId: row.assetId,
      deviceName: device?.name ?? null,
      currentZone,
      targetZone,
      skipped,
      unchanged:
        error === null && !skipped && device?.tags?.[ASSET_TAG] === row.assetId,
      error,
    };
  });
}

export function parseZoneMapping(
  text: string,
  context: MappingContext,
): ParsedMapping {
  const { fileError, raw } = readMappingRows(text);
  return { fileError, rows: resolveMappingRows(raw, context) };
}

/** The assignments to send, deduplicated: a device repeated with the same
 *  zone is one instruction, however many times the file says it. */
export function toAssignments(rows: MappingRow[]): AssetAssignment[] {
  const byDevice = new Map<string, string>();
  for (const row of rows) {
    if (row.error === null && !row.skipped) {
      byDevice.set(row.deviceId, row.assetId);
    }
  }
  return [...byDevice].map(([device_id, asset_id]) => ({
    device_id,
    asset_id,
  }));
}

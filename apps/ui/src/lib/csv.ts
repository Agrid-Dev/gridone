/** Client-side CSV serialization, for exports the backend doesn't render. */
import { downloadBlob } from "./download";

/** Byte-order mark. Excel assumes the host's legacy codepage for a bare `.csv`
 *  and mangles accented device names; the BOM makes it read UTF-8. */
const UTF8_BOM = "﻿";

/** Quotes a field only when it needs it — RFC 4180 leaves bare fields valid,
 *  and quoting everything makes the file noisier to read. A field carrying a
 *  comma, a quote, or a line break is wrapped, with inner quotes doubled. */
function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** RFC 4180 CSV text (CRLF-separated) for a header row plus its data rows. */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((row) => row.map(escapeField).join(","))
    .join("\r\n");
}

/** Serializes to CSV and downloads it as *filename*. */
export function downloadCsv(
  header: string[],
  rows: string[][],
  filename: string,
) {
  const blob = new Blob([UTF8_BOM, toCsv(header, rows)], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, filename);
}

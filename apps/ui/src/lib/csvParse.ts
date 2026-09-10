/** Client-side CSV reading, the counterpart of `csv.ts`'s serialization. */

/** Byte-order mark. Excel writes one in front of UTF-8 files, and it would
 *  otherwise ride along inside the first header name. */
const UTF8_BOM = "﻿";

/**
 * Parses RFC 4180 CSV text into rows of raw fields.
 *
 * Handles what a spreadsheet actually exports: a leading BOM, quoted fields
 * carrying commas or line breaks, doubled quotes inside a quoted field, and
 * CRLF, LF or bare CR line endings. A trailing newline yields no extra row.
 * Fields are returned verbatim — trimming and interpretation belong to the
 * caller, which knows what each column means.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(UTF8_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\r" || char === "\n") {
      endRow();
      // CRLF is one break, not two.
      if (char === "\r" && source[i + 1] === "\n") i++;
    } else {
      field += char;
    }
  }

  // A file that ends on a newline has already closed its last row; anything
  // else still holds one field's worth of text.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

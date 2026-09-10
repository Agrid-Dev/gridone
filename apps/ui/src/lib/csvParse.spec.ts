import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";
import { toCsv } from "./csv";

describe("parseCsv", () => {
  it("reads a plain comma-separated file", () => {
    expect(parseCsv("device_id,asset_id\nd1,z1\nd2,z2")).toEqual([
      ["device_id", "asset_id"],
      ["d1", "z1"],
      ["d2", "z2"],
    ]);
  });

  it.each([
    ["CRLF", "a,b\r\nc,d"],
    ["LF", "a,b\nc,d"],
    ["bare CR", "a,b\rc,d"],
  ])("accepts %s line endings", (_label, text) => {
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips the UTF-8 BOM off the first field", () => {
    expect(parseCsv("﻿device_id,asset_id")).toEqual([
      ["device_id", "asset_id"],
    ]);
  });

  it("keeps commas, quotes and line breaks inside a quoted field", () => {
    expect(parseCsv('"a,b","say ""hi""","line1\nline2"')).toEqual([
      ["a,b", 'say "hi"', "line1\nline2"],
    ]);
  });

  it("does not turn a trailing newline into an empty row", () => {
    expect(parseCsv("a,b\r\n")).toEqual([["a", "b"]]);
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(parseCsv("d1,")).toEqual([["d1", ""]]);
  });

  it("returns no rows for empty text", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("round-trips what toCsv writes", () => {
    const header = ["device_id", "asset_id"];
    const rows = [
      ["d1", "z1"],
      ['weird, "name"', "z2"],
    ];

    expect(parseCsv(toCsv(header, rows))).toEqual([header, ...rows]);
  });
});

import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins fields with commas and rows with CRLF", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          ["1", "2"],
          ["3", "4"],
        ],
      ),
    ).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("emits the header alone when there are no rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });

  it.each([
    ["comma", "Floor 1, zone A", '"Floor 1, zone A"'],
    ["newline", "line1\nline2", '"line1\nline2"'],
    ["carriage return", "line1\r\nline2", '"line1\r\nline2"'],
    ["double quote", 'say "hi"', '"say ""hi"""'],
  ])("quotes a field containing a %s", (_label, input, expected) => {
    expect(toCsv(["h"], [[input]])).toBe(`h\r\n${expected}`);
  });

  it("leaves ordinary fields unquoted", () => {
    expect(toCsv(["h"], [["Chiller 3 - RDC"]])).toBe("h\r\nChiller 3 - RDC");
  });
});

import { describe, expect, it } from "vitest";
import { extractDriverId } from "./drivers";

describe("extractDriverId", () => {
  it("extracts an unquoted id", () => {
    expect(extractDriverId("id: my_driver\ntransport: http")).toBe("my_driver");
  });

  it("extracts a double-quoted id", () => {
    expect(extractDriverId('id: "my_driver"\ntransport: http')).toBe(
      "my_driver",
    );
  });

  it("extracts a single-quoted id", () => {
    expect(extractDriverId("id: 'my_driver'\ntransport: http")).toBe(
      "my_driver",
    );
  });

  it("strips a trailing inline comment from an unquoted id", () => {
    expect(extractDriverId("id: my_driver # main driver")).toBe("my_driver");
  });

  it("does not strip a '#' inside a quoted id", () => {
    expect(extractDriverId('id: "my_driver#1"')).toBe("my_driver#1");
  });

  it("does not silently strip mismatched quotes", () => {
    expect(extractDriverId("id: \"my_driver'")).toBe("\"my_driver'");
  });

  it("throws when there is no top-level id field", () => {
    expect(() => extractDriverId("transport: http")).toThrow(
      "Driver YAML must include a top-level 'id' field",
    );
  });

  it("throws when the id field is empty", () => {
    expect(() => extractDriverId("id: \ntransport: http")).toThrow(
      "Driver YAML must include a top-level 'id' field",
    );
  });

  it("ignores an id-looking field that is not top-level", () => {
    expect(() =>
      extractDriverId("device_config:\n  - id: nested\ntransport: http"),
    ).toThrow("Driver YAML must include a top-level 'id' field");
  });
});

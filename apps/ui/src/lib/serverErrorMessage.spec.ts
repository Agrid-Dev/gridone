import { describe, expect, it } from "vitest";
import { GridoneError, NetworkError } from "@gridone/sdk";
import { serverErrorMessage } from "./serverErrorMessage";

describe("serverErrorMessage", () => {
  it("returns string details for 4xx domain errors", () => {
    expect(serverErrorMessage(new GridoneError(409, "Name already used"))).toBe(
      "Name already used",
    );
  });

  it("surfaces the crafted app-fault 503 bodies", () => {
    expect(
      serverErrorMessage(new GridoneError(503, "App is unreachable")),
    ).toBe("App is unreachable");
  });

  it("flattens validation arrays to field-labeled lines, not JSON", () => {
    const error = new GridoneError(422, [
      {
        loc: ["body", "mqtt", "config", "host"],
        msg: "Host is unreachable",
        type: "value_error",
      },
      { loc: [], msg: "Passwords must be set together", type: "value_error" },
    ]);

    expect(serverErrorMessage(error)).toBe(
      "host: Host is unreachable; Passwords must be set together",
    );
  });

  it("labels indexed locations with their nearest field name", () => {
    const error = new GridoneError(422, [
      { loc: ["meters", 0, "point_id"], msg: "Point is unknown", type: "enum" },
    ]);

    expect(serverErrorMessage(error)).toBe("point_id: Point is unknown");
  });

  it("dedupes repeated lines", () => {
    const error = new GridoneError(422, [
      { loc: ["body", "device_id"], msg: "Extra inputs", type: "extra" },
      { loc: ["device_id"], msg: "Extra inputs", type: "extra" },
    ]);

    expect(serverErrorMessage(error)).toBe("device_id: Extra inputs");
  });

  it.each([
    ["a 500 with a string detail", new GridoneError(500, "Traceback: ...")],
    ["a network error", new NetworkError("fetch failed")],
    ["a plain Error", new Error("boom")],
    ["undefined", undefined],
  ])(
    "returns undefined for %s (caller shows its fallback)",
    (_label, error) => {
      expect(serverErrorMessage(error)).toBeUndefined();
    },
  );
});

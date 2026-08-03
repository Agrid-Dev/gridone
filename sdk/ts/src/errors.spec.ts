import { describe, expect, it } from "vitest";

import {
  GridoneError,
  isGridoneError,
  isNotFound,
  NetworkError,
  normalizeError,
  type ValidationErrorItem,
} from "./errors";

const VALIDATION_ITEMS: ValidationErrorItem[] = [
  {
    loc: ["body", "mqtt", "config", "host"],
    msg: "Field required",
    type: "missing",
  },
  {
    loc: ["body", "targets", 0, "device_id"],
    msg: "Extra inputs are not permitted",
    type: "extra_forbidden",
  },
];

describe("GridoneError", () => {
  it("exposes status, detail and a readable message", () => {
    const error = new GridoneError(404, "Device not found");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GridoneError");
    expect(error.status).toBe(404);
    expect(error.detail).toBe("Device not found");
    expect(error.rawDetail).toBe("Device not found");
    expect(error.message).toBe("HTTP 404: Device not found");
    expect(error.validationErrors).toBeUndefined();
  });

  it("propagates a cause", () => {
    const cause = new Error("boom");
    const error = new GridoneError(500, "Internal server error", { cause });

    expect(error.cause).toBe(cause);
  });

  it("parses a well-formed validation array and keeps detail stringified", () => {
    const error = new GridoneError(422, VALIDATION_ITEMS);

    expect(error.validationErrors).toEqual(VALIDATION_ITEMS);
    expect(error.rawDetail).toBe(VALIDATION_ITEMS);
    expect(error.detail).toBe(JSON.stringify(VALIDATION_ITEMS));
  });

  it.each([
    ["an empty array", []],
    ["an item missing type", [{ loc: ["body", "name"], msg: "required" }]],
    ["an item missing loc", [{ msg: "required", type: "missing" }]],
    ["a non-array loc", [{ loc: "body.name", msg: "m", type: "t" }]],
    ["a loc with an object segment", [{ loc: [{}], msg: "m", type: "t" }]],
    ["a non-string msg", [{ loc: ["body"], msg: 1, type: "t" }]],
    ["a non-object item", ["oops"]],
    ["a null item", [null]],
    ["a non-array detail", { loc: ["body"], msg: "m", type: "t" }],
  ])("does not parse %s as validation errors", (_label, detail) => {
    const error = new GridoneError(422, detail);

    expect(error.validationErrors).toBeUndefined();
    expect(error.detail).toBe(JSON.stringify(detail));
  });
});

describe("NetworkError", () => {
  it("is a GridoneError with status 0", () => {
    const error = new NetworkError();

    expect(error).toBeInstanceOf(GridoneError);
    expect(error.name).toBe("NetworkError");
    expect(error.status).toBe(0);
    expect(error.detail).toBe("Network request failed");
  });

  it("accepts a custom detail", () => {
    expect(new NetworkError("Connection refused").detail).toBe(
      "Connection refused",
    );
  });
});

describe("type guards", () => {
  it.each([
    ["a GridoneError", new GridoneError(400, "Bad request"), true],
    ["a NetworkError", new NetworkError(), true],
    ["a plain Error", new Error("nope"), false],
    ["a non-error", "nope", false],
  ])("isGridoneError recognizes %s", (_label, value, expected) => {
    expect(isGridoneError(value)).toBe(expected);
  });

  it.each([
    ["a 404 GridoneError", new GridoneError(404, "Not found"), true],
    ["a 500 GridoneError", new GridoneError(500, "Server error"), false],
    ["a plain Error", new Error("nope"), false],
  ])("isNotFound recognizes %s", (_label, value, expected) => {
    expect(isNotFound(value)).toBe(expected);
  });
});

describe("normalizeError", () => {
  it("maps a well-formed 422 array to fieldErrors", () => {
    const normalized = normalizeError(new GridoneError(422, VALIDATION_ITEMS));

    expect(normalized).toEqual({
      kind: "fieldErrors",
      errors: VALIDATION_ITEMS,
    });
  });

  it.each([
    [403, "Forbidden"],
    [404, "Transport not found"],
    [409, "A transport with this name already exists"],
    [422, "End must be after start"],
    [502, "Upstream device rejected the command"],
  ])("maps a string-detail %i to message", (status, detail) => {
    expect(normalizeError(new GridoneError(status, detail))).toEqual({
      kind: "message",
      message: detail,
    });
  });

  it.each([
    ["a 500 with a string detail", new GridoneError(500, "Traceback: ...")],
    ["a 503 with a string detail", new GridoneError(503, "App is unreachable")],
    ["a network error", new NetworkError("fetch failed")],
    ["a 422 with a malformed array", new GridoneError(422, [{ oops: true }])],
    ["a 400 with an object detail", new GridoneError(400, { code: 3 })],
    ["a plain Error", new Error("boom")],
    ["a non-error value", "boom"],
    ["undefined", undefined],
  ])("maps %s to unknown", (_label, error) => {
    expect(normalizeError(error)).toEqual({ kind: "unknown" });
  });
});

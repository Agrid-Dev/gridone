import { describe, expect, it } from "vitest";

import {
  GridoneError,
  isGridoneError,
  isNotFound,
  NetworkError,
} from "./errors";

describe("GridoneError", () => {
  it("exposes status, detail and a readable message", () => {
    const error = new GridoneError(404, "Device not found");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GridoneError");
    expect(error.status).toBe(404);
    expect(error.detail).toBe("Device not found");
    expect(error.message).toBe("HTTP 404: Device not found");
  });

  it("propagates a cause", () => {
    const cause = new Error("boom");
    const error = new GridoneError(500, "Internal server error", { cause });

    expect(error.cause).toBe(cause);
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

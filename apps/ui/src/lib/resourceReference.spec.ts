import { describe, expect, it } from "vitest";
import {
  RESOURCE_TYPES,
  parseResourceReference,
  resourceTypeToPath,
  serializeResourceReference,
  type ResourceType,
} from "./resourceReference";

describe("parseResourceReference", () => {
  it.each(RESOURCE_TYPES)("parses %s references", (type) => {
    expect(parseResourceReference(`resource://${type}/abc123`)).toEqual({
      type,
      id: "abc123",
    });
  });

  it("preserves ids that contain slashes after the type segment", () => {
    expect(parseResourceReference("resource://device/site-a/dev-1")).toEqual({
      type: "device",
      id: "site-a/dev-1",
    });
  });

  it.each([
    "",
    "not-a-uri",
    "resource://device/",
    "resource:///abc",
    "resource://bogus/abc",
    "https://device/abc",
  ])("returns null for malformed input %s", (input) => {
    expect(parseResourceReference(input)).toBeNull();
  });

  it("round-trips with serializeResourceReference", () => {
    const ref = { type: "automation" as const, id: "auto-42" };
    expect(parseResourceReference(serializeResourceReference(ref))).toEqual(
      ref,
    );
  });
});

describe("resourceTypeToPath", () => {
  it.each<[ResourceType, string]>([
    ["device", "/devices/x"],
    ["driver", "/drivers/x"],
    ["transport", "/transports/x"],
    ["asset", "/assets/x"],
    ["automation", "/automations/x"],
    ["fault", "/faults"],
    ["command", "/devices/commands"],
  ])("maps %s to %s", (type, expected) => {
    expect(resourceTypeToPath(type, "x")).toBe(expected);
  });
});

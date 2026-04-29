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

  it.each([
    "",
    "not-a-uri",
    "resource://device/",
    "resource:///abc",
    "resource://bogus/abc",
    "https://device/abc",
    "resource://device/site-a/dev-1",
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
    ["command", "/devices/commands?batch_id=x"],
  ])("maps %s to %s", (type, expected) => {
    expect(resourceTypeToPath(type, "x")).toBe(expected);
  });
});

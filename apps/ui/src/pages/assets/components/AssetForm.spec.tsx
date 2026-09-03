import { describe, expect, it } from "vitest";
import { showsUsageField, toAssetPayload } from "./AssetForm";
import type { AssetFormValues } from "./AssetForm";

const values = (overrides: Partial<AssetFormValues> = {}): AssetFormValues => ({
  name: "Room 201",
  type: "room",
  parentId: "floor",
  usage: null,
  ...overrides,
});

describe("toAssetPayload", () => {
  it("sends the chosen usage on a level that carries one", () => {
    expect(toAssetPayload(values({ usage: "hotel_room" }))).toEqual({
      name: "Room 201",
      type: "room",
      parent_id: "floor",
      usage: "hotel_room",
    });
  });

  it("omits the usage of an unclassified asset on a level without one", () => {
    expect(toAssetPayload(values({ type: "floor" }))).not.toHaveProperty(
      "usage",
    );
  });

  // The backend refuses to drop a classification the request never mentions,
  // and this is what lets that guard fire: a re-type that leaves the stored
  // usage untouched says nothing about it, so the API answers "clear its usage
  // first" instead of the form wiping it.
  it("omits an untouched stored usage when the type leaves room/zone", () => {
    const payload = toAssetPayload(
      values({ type: "floor", usage: "hotel_room" }),
      "hotel_room",
    );

    expect(payload).not.toHaveProperty("usage");
  });

  it("sends an explicit null once the operator clears a stored usage", () => {
    const payload = toAssetPayload(values({ type: "floor" }), "hotel_room");

    expect(payload).toMatchObject({ type: "floor", usage: null });
  });
});

describe("showsUsageField", () => {
  it.each([
    ["room", null, true],
    ["zone", null, true],
    ["floor", null, false],
    // Still on screen on a level that cannot carry it: the operator needs the
    // select to clear the usage in that same form.
    ["floor", "hotel_room", true],
    ["building", "office", true],
  ] as const)("%s carrying %s → %s", (type, usage, expected) => {
    expect(showsUsageField(type, usage)).toBe(expected);
  });
});

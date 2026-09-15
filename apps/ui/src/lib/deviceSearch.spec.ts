import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  DEVICE_SEARCH_LIMIT,
  filterGlobalSearch,
  searchDevices,
} from "./deviceSearch";
import { serializeResourceReference } from "./resourceReference";

/** A device also carries required config/driver/transport fields the ranking
 *  never reads, hence the cast. `name` is required but may be empty: the API
 *  defaults it to "" for devices created before they are labelled. */
function device(id: string, name = ""): Device {
  return { id, name } as Device;
}

describe("searchDevices", () => {
  it("ranks exact matches, prefixes, word starts, then substrings, preferring names within each tier", () => {
    const ranked = [
      device("1", "ECS"),
      device("ECS", "A ID exact"),
      device("2", "ECS boiler"),
      device("ecs-01", "A ID prefix"),
      device("3", "Ballon ECS"),
      device("room_ecs", "A ID word start"),
      device("4", "abecs"),
      device("abecs", "A ID substring"),
    ];
    expect(searchDevices([...ranked].reverse(), "ECS").devices).toEqual(ranked);
  });

  it.each(["Ballon_ECS", "Ballon-ECS", "Ballon/ECS", "abecs ECS"])(
    "recognizes the word start in %s",
    (name) => {
      const wordStart = device("1", name);
      const substring = device("2", "aecs");
      expect(searchDevices([substring, wordStart], "ecs").devices).toEqual([
        wordStart,
        substring,
      ]);
    },
  );

  it.each(["éECS", "水ECS", "𐐀ECS", "1ECS"])(
    "does not treat letters or numbers as word boundaries in %s",
    (name) => {
      const substring = device("1", name);
      const wordStart = device("2", "Zulu ECS");
      expect(searchDevices([substring, wordStart], "ecs").devices[0]).toEqual(
        wordStart,
      );
    },
  );

  it.each(["ecs", " EcS ", "ECS"])(
    "normalizes the query %j and excludes loose fuzzy matches",
    (query) => {
      const match = device("1", "Ballon ECS");
      expect(
        searchDevices([device("2", "Electric controls"), match], query),
      ).toEqual({ devices: [match], overflow: 0 });
    },
  );

  it("matches multiword substrings without matching across the name/ID boundary", () => {
    const match = device("1", "Ballon ECS Nord");
    expect(
      searchDevices([device("Nord", "ECS"), match], "ecs nord").devices,
    ).toEqual([match]);
  });

  it("ranks the whole fleet before capping and counts only matching overflow", () => {
    const substrings = Array.from({ length: DEVICE_SEARCH_LIMIT + 2 }, (_, i) =>
      device(`id-${i}`, `abecs ${i.toString().padStart(2, "0")}`),
    );
    const prefix = device("best", "ECS boiler");
    const results = searchDevices(
      [...substrings, device("unrelated", "Electric controls"), prefix],
      "ecs",
    );
    expect(results.devices).toEqual([
      prefix,
      ...substrings.slice(0, DEVICE_SEARCH_LIMIT - 1),
    ]);
    expect(results.overflow).toBe(3);
  });

  it.each(["", "   "])("caps an empty query %j alphabetically", (query) => {
    const devices = Array.from({ length: DEVICE_SEARCH_LIMIT + 1 }, (_, i) =>
      device(`id-${i}`, `Device ${i.toString().padStart(2, "0")}`),
    );
    expect(searchDevices([...devices].reverse(), query)).toEqual({
      devices: devices.slice(0, DEVICE_SEARCH_LIMIT),
      overflow: 1,
    });
  });

  it("uses IDs for unnamed devices and sorts ties without mutating the source", () => {
    const devices = [device("z"), device("b", "Beta"), device("a", "alpha")];
    expect(searchDevices(devices, "").devices.map(({ id }) => id)).toEqual([
      "a",
      "b",
      "z",
    ]);
    expect(devices.map(({ id }) => id)).toEqual(["z", "b", "a"]);
    expect(searchDevices(devices, "z").devices).toEqual([devices[0]]);
  });

  it("has no overflow at the cap", () => {
    const devices = Array.from({ length: DEVICE_SEARCH_LIMIT }, (_, i) =>
      device(String(i), `ECS ${i}`),
    );
    expect(searchDevices(devices, "ecs").overflow).toBe(0);
  });

  it.each([{ devices: [] }, { devices: [device("1", "Boiler")] }])(
    "returns an empty result for no matches",
    ({ devices }) => {
      expect(searchDevices(devices, "not-found")).toEqual({
        devices: [],
        overflow: 0,
      });
    },
  );
});

describe("filterGlobalSearch", () => {
  const deviceValue = serializeResourceReference({ type: "device", id: "d1" });

  it("ranks device rows from their keywords, not their opaque value", () => {
    expect(
      filterGlobalSearch(deviceValue, "ecs", ["Ballon ECS", "d1"]),
    ).toBeGreaterThan(filterGlobalSearch(deviceValue, "ecs", ["abecs", "d1"]));
  });

  it("excludes device rows that only match fuzzily", () => {
    expect(
      filterGlobalSearch(deviceValue, "ecs", ["Electric controls", "d1"]),
    ).toBe(0);
  });

  it.each([
    {
      label: "a zone row",
      value: "Building A b1",
      query: "blda",
      keywords: undefined,
    },
    {
      label: "another resource type",
      value: serializeResourceReference({ type: "asset", id: "a1" }),
      query: "ecs",
      keywords: ["Electric controls", "a1"],
    },
  ])("keeps cmdk's fuzzy filter for $label", ({ value, query, keywords }) => {
    expect(filterGlobalSearch(value, query, keywords)).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { filterAttributeOption, matchesAllWords } from "./attributeSearch";

describe("matchesAllWords", () => {
  it.each([
    ["Air  Soufflé", true],
    ["air pompe", false],
    ["   ", true],
  ])("%j in the folded text is %s", (query, expected) => {
    expect(matchesAllWords("temperature air souffle", query)).toBe(expected);
  });
});

describe("filterAttributeOption", () => {
  it.each([
    ["flow_rate", "debit", ["Débit"], 1],
    ["flow_rate", "FLOW_R", undefined, 1],
    [
      "supply_air_temperature",
      "supply soufflé",
      ["Température air soufflé"],
      1,
    ],
    ["setpoint_mode_pump", "temp", ["Mode consigne pompe"], 0],
  ])(
    "%s searched with %j (label %j) scores %d",
    (value, query, keywords, score) => {
      expect(filterAttributeOption(value, query, keywords)).toBe(score);
    },
  );
});

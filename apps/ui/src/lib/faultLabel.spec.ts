import { describe, it, expect } from "vitest";
import { faultLabel } from "./faultLabel";

describe("faultLabel", () => {
  const cases: Array<{
    title: string;
    input: Parameters<typeof faultLabel>[0];
    expected: string;
  }> = [
    {
      title: "bool: snake_case name is Title Cased",
      input: { name: "filter_alarm", dataType: "bool", currentValue: true },
      expected: "Filter Alarm",
    },
    {
      title: "bool: camelCase name is Title Cased",
      input: { name: "filterAlarm", dataType: "bool", currentValue: false },
      expected: "Filter Alarm",
    },
    {
      title: "str: returns currentValue verbatim",
      input: {
        name: "error_state",
        dataType: "str",
        currentValue: "High pressure",
      },
      expected: "High pressure",
    },
    {
      title: "str: falls back to Title Case name when currentValue is null",
      input: { name: "error_state", dataType: "str", currentValue: null },
      expected: "Error State",
    },
    {
      title: "int: combines Title Case name and value",
      input: { name: "error_code", dataType: "int", currentValue: 42 },
      expected: "Error Code: 42",
    },
    {
      title: "int: null currentValue renders empty suffix",
      input: { name: "error_code", dataType: "int", currentValue: null },
      expected: "Error Code: ",
    },
    {
      title: "unknown dataType falls through to the bool branch",
      input: { name: "mystery_field", dataType: "float", currentValue: 1.2 },
      expected: "Mystery Field",
    },
  ];

  it.each(cases)("$title", ({ input, expected }) => {
    expect(faultLabel(input)).toBe(expected);
  });
});

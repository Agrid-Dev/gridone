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
      input: { name: "filter_alarm", data_type: "bool", current_value: true },
      expected: "Filter Alarm",
    },
    {
      title: "bool: camelCase name is Title Cased",
      input: { name: "filterAlarm", data_type: "bool", current_value: false },
      expected: "Filter Alarm",
    },
    {
      title: "str: returns current_value verbatim",
      input: {
        name: "error_state",
        data_type: "str",
        current_value: "High pressure",
      },
      expected: "High pressure",
    },
    {
      title: "str: falls back to Title Case name when current_value is null",
      input: { name: "error_state", data_type: "str", current_value: null },
      expected: "Error State",
    },
    {
      title: "int: combines Title Case name and value",
      input: { name: "error_code", data_type: "int", current_value: 42 },
      expected: "Error Code: 42",
    },
    {
      title: "int: null current_value renders empty suffix",
      input: { name: "error_code", data_type: "int", current_value: null },
      expected: "Error Code: ",
    },
    {
      title: "unknown dataType falls through to the bool branch",
      input: { name: "mystery_field", data_type: "float", current_value: 1.2 },
      expected: "Mystery Field",
    },
  ];

  it.each(cases)("$title", ({ input, expected }) => {
    expect(faultLabel(input)).toBe(expected);
  });
});

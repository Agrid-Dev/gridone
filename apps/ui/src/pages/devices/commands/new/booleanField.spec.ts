import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "common.true": "True",
    "common.false": "False",
  }),
);

import { useBooleanField } from "./booleanField";

const labels = [
  { value: false, label: { default: "Stopped" } },
  { value: true, label: { default: "Running" } },
];

const field = (...args: Parameters<ReturnType<typeof useBooleanField>>) =>
  renderHook(() => useBooleanField()).result.current(...args);

describe("useBooleanField", () => {
  it("reads as a switch when both states are open", () => {
    // No projection at all, and a projection that allows both: nothing to
    // refuse, so the switch carries the driver's wording.
    expect(field(labels)).toEqual({
      kind: "switch",
      sides: { false: "Stopped", true: "Running" },
    });
    expect(
      field(null, [
        { value: false, available: true },
        { value: true, available: true },
      ]),
    ).toEqual({ kind: "switch", sides: { false: "False", true: "True" } });
  });

  it("moves to options when a state is refused, keeping its reason", () => {
    expect(
      field(labels, [
        { value: false, available: true },
        {
          value: true,
          available: false,
          // An authored message needs no catalog, so the mapping is asserted
          // without i18next.
          reasons: [
            { code: "blocked", message: { default: "Filter running" } },
          ],
        },
      ]),
    ).toEqual({
      kind: "select",
      options: [
        { value: false, label: "Stopped", disabled: false, reason: "" },
        {
          value: true,
          label: "Running",
          disabled: true,
          reason: "Filter running",
        },
      ],
    });
  });

  it("refuses a state the projection leaves out", () => {
    // A driver declaring a single `write_options` entry: the other state is
    // not a supported value, so it must not be reachable.
    expect(field(labels, [{ value: false, available: true }])).toEqual({
      kind: "select",
      options: [
        { value: false, label: "Stopped", disabled: false, reason: "" },
        { value: true, label: "Running", disabled: true, reason: "" },
      ],
    });
  });
});

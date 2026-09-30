import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Synoptic } from "@gridone/sdk";
import type { SlotReading } from "@/components/synoptic/values";
import { usePlateEntries } from "./usePlateEntries";
import type { PageVocabulary } from "./usePlateVocabulary";

const vocabulary = { typeLabel: (type: string) => type } as PageVocabulary;

const on: SlotReading = {
  text: "MARCHE",
  unit: null,
  raw: true,
  stale: false,
  faulty: false,
};

const DOC = {
  id: "p",
  name: "p",
  metadata: {},
  symbols: [
    {
      id: "pec",
      type: "pump_double",
      placement: { kind: "pipe", pipe: "run", cell: { x: 1, y: 0 } },
      label: "PEC",
      props: { heads: { a: { device_id: "PEC-A" } } },
    },
  ],
} as Synoptic;

describe("usePlateEntries", () => {
  it("lists a twin pump once per head, each with its own state, fault and device", () => {
    const { result } = renderHook(() =>
      usePlateEntries(
        DOC,
        {
          slots: { "symbol.pec.state_a": on },
          devices: { "PEC-A": { faulty: true, severity: "warning" } },
        },
        vocabulary,
      ),
    );
    expect(
      result.current.map(({ head, name, state, fault, device }) => ({
        head,
        name,
        state,
        fault,
        device,
      })),
    ).toEqual([
      { head: "a", name: "PEC A", state: "on", fault: "warning", device: true },
      {
        head: "b",
        name: "PEC B",
        state: undefined,
        fault: null,
        device: false,
      },
    ]);
  });
});

import { symbolSchemas } from "@gridone/sdk";
import { describe, expect, it, vi } from "vitest";
import { collectorPorts, portsOf, symbolPort } from "./ports";

describe("CollectorProps", () => {
  it("names the fields the backend's collector props schema declares", () => {
    const props = { axis: "x", length: 2, ports: {} };
    const declared = Object.keys(symbolSchemas.collector!.properties);
    expect(Object.keys(props).sort()).toEqual(declared.sort());
  });
});

describe("symbolPort", () => {
  it("moves the type's port offset to the symbol's origin", () => {
    expect(symbolPort("tank", { x: 2, y: 3 }, 0, "dhw_in")).toEqual({
      cell: { x: 2, y: 4, z: 0 },
      side: "+x",
    });
  });

  it("turns the offset and the face with the symbol", () => {
    expect(symbolPort("tank", { x: 2, y: 3 }, 1, "primary_out")).toEqual({
      cell: { x: 1, y: 3, z: 0 },
      side: "-y",
    });
  });

  it("carries the origin's height", () => {
    expect(
      symbolPort("heat_pump", { x: 0, y: 0, z: 1 }, 0, "supply")?.cell,
    ).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("reads a collector's ports off its props", () => {
    const props = {
      axis: "y" as const,
      length: 4,
      ports: {
        in_1: { offset: 0, side: "-y" as const },
        out_1: { offset: 2, side: "+x" as const },
      },
    };
    expect(symbolPort("collector", { x: 5, y: 5 }, 0, "out_1", props)).toEqual({
      cell: { x: 5, y: 7, z: 0 },
      side: "+x",
    });
    expect(collectorPorts({ ...props, axis: "x" }).out_1.offset).toEqual({
      x: 2,
      y: 0,
      z: 0,
    });
  });

  it("resolves nothing for an unknown type or port, and says so in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(symbolPort("reactor", { x: 0, y: 0 }, 0, "in")).toBeUndefined();
    expect(warn).toHaveBeenLastCalledWith("Unknown symbol type reactor");
    expect(symbolPort("tank", { x: 0, y: 0 }, 0, "steam")).toBeUndefined();
    expect(warn).toHaveBeenLastCalledWith("Symbol type tank has no port steam");
    expect(symbolPort("collector", { x: 0, y: 0 }, 0, "in_1")).toBeUndefined();
    warn.mockRestore();
  });
});

describe("portsOf", () => {
  it("lists a type's own ports, a collector's authored ones, and nothing for an unknown type", () => {
    expect(Object.keys(portsOf("tank"))).toEqual([
      "primary_in",
      "primary_out",
      "dhw_out",
      "dhw_in",
    ]);
    // A port whose offset is still blank while the collector is authored
    // is left out rather than resolved to a NaN cell.
    const ports = portsOf("collector", {
      axis: "x",
      length: 4,
      ports: {
        in_1: { offset: 0, side: "-y" },
        out_1: { offset: null as unknown as number, side: "+y" },
      },
    });
    expect(Object.keys(ports)).toEqual(["in_1"]);
    expect(portsOf("collector")).toEqual({});
    expect(portsOf("no_such_type")).toEqual({});
  });
});

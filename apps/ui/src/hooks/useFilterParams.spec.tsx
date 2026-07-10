import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { useFilterParams } from "./useFilterParams";

function wrapperFor(entries: string[]) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={entries}>{children}</MemoryRouter>;
  }
  return Wrapper;
}

describe("useFilterParams", () => {
  it("returns undefined when no filter params are set", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/"]),
    });
    expect(result.current).toBeUndefined();
  });

  it("maps ?type=thermostat to { types: ['thermostat'] }", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?type=thermostat"]),
    });
    expect(result.current).toEqual({ types: ["thermostat"] });
  });

  it("maps ?health=faulty to { is_faulty: true }", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?health=faulty"]),
    });
    expect(result.current).toEqual({ is_faulty: true });
  });

  it("maps ?health=healthy to { is_faulty: false }", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?health=healthy"]),
    });
    expect(result.current).toEqual({ is_faulty: false });
  });

  it("returns undefined when ?health=all (treated as no filter)", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?health=all"]),
    });
    expect(result.current).toBeUndefined();
  });

  it("ignores invalid health values", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?health=unknown"]),
    });
    expect(result.current).toBeUndefined();
  });

  it("combines type and health filters", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?type=thermostat&health=faulty"]),
    });
    expect(result.current).toEqual({
      types: ["thermostat"],
      is_faulty: true,
    });
  });

  it("maps ?search=chambre%2012 to { search: 'chambre 12' }", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?search=chambre%2012"]),
    });
    expect(result.current).toEqual({ search: "chambre 12" });
  });

  it("ignores a blank search param", () => {
    const { result } = renderHook(() => useFilterParams(), {
      wrapper: wrapperFor(["/?search=%20%20"]),
    });
    expect(result.current).toBeUndefined();
  });
});

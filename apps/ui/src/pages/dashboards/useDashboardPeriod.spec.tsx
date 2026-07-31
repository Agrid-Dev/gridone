import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { DASHBOARD_DEFAULT_PRESET } from "@/lib/timeRange";
import {
  LIVE_REFETCH_INTERVAL_MS,
  useDashboardPeriod,
} from "./useDashboardPeriod";

function wrapperFor(entries: string[]) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={entries}>{children}</MemoryRouter>;
  }
  return Wrapper;
}

function renderPeriod(url: string) {
  return renderHook(() => useDashboardPeriod(), {
    wrapper: wrapperFor([url]),
  }).result;
}

describe("useDashboardPeriod", () => {
  it("falls back to the dashboard default preset on a bare URL", () => {
    const { current } = renderPeriod("/dashboards/d1");
    expect(current.range).toEqual({
      kind: "preset",
      preset: DASHBOARD_DEFAULT_PRESET,
    });
    expect(current.query).toEqual({ last: DASHBOARD_DEFAULT_PRESET });
  });

  it("reads the period from the URL so a shared link reproduces the view", () => {
    const { current } = renderPeriod("/dashboards/d1?last=3mo");
    expect(current.query).toEqual({ last: "3mo" });
  });

  it("passes a custom range through as start/end", () => {
    const { current } = renderPeriod(
      "/dashboards/d1?start=2026-01-01T00:00&end=2026-01-31T23:59",
    );
    expect(current.query).toEqual({
      start: "2026-01-01T00:00",
      end: "2026-01-31T23:59",
    });
  });

  it("never pins a timezone, leaving the API on the building timezone", () => {
    const { current } = renderPeriod("/dashboards/d1?last=1d");
    expect(current.query).not.toHaveProperty("timezone");
  });

  it("polls every 5 min while the period tracks the present", () => {
    const { current } = renderPeriod("/dashboards/d1?last=1d");
    expect(current.refetchInterval).toBe(LIVE_REFETCH_INTERVAL_MS);
  });

  it("stops polling for a closed custom range", () => {
    const { current } = renderPeriod(
      "/dashboards/d1?start=2026-01-01T00:00&end=2026-01-31T23:59",
    );
    expect(current.refetchInterval).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { DashboardSummary } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({ "tabs.label": "Dashboards", "tabs.new": "New dashboard" }),
);

// Imported after the i18n mock is registered.
import { DashboardTabs } from "./DashboardTabs";

const SUMMARIES = [
  { id: "d1", name: "Energy" },
  { id: "d2", name: "Comfort" },
] as unknown as DashboardSummary[];

function renderTabs(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <DashboardTabs summaries={SUMMARIES} activeId="d1" />
    </MemoryRouter>,
  );
  return (name: string) =>
    (screen.getByText(name).closest("a") as HTMLAnchorElement).getAttribute(
      "href",
    );
}

afterEach(cleanup);

describe("DashboardTabs", () => {
  it("carries the period across to the other dashboard", () => {
    const href = renderTabs("/dashboards/d1?last=7d");
    expect(href("Comfort")).toBe("/dashboards/d2?last=7d");
  });

  it("carries a custom range across", () => {
    const href = renderTabs(
      "/dashboards/d1?start=2026-01-01T00%3A00&end=2026-01-31T23%3A59",
    );
    expect(href("Comfort")).toContain("start=2026-01-01T00%3A00");
    expect(href("Comfort")).toContain("end=2026-01-31T23%3A59");
  });

  // Anything else on this route belongs to the dashboard being viewed, not to
  // the one being linked to — `?edit=layout` is already such a param.
  it("leaves the rest of the query string behind", () => {
    const href = renderTabs("/dashboards/d1?last=7d&edit=layout&page=3");
    expect(href("Comfort")).toBe("/dashboards/d2?last=7d");
  });

  it("links cleanly when the period is the default", () => {
    const href = renderTabs("/dashboards/d1?edit=layout");
    expect(href("Comfort")).toBe("/dashboards/d2");
  });
});

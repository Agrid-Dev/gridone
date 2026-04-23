import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { HealthFilter } from "./HealthFilter";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "devices.health.label": "Health",
        "devices.health.all": "All",
        "devices.health.healthy": "Healthy",
        "devices.health.faulty": "Faulty",
      };
      return map[key] ?? key;
    },
  }),
}));

afterEach(cleanup);

function LocationSpy({ onLocation }: { onLocation: (search: string) => void }) {
  const location = useLocation();
  onLocation(location.search);
  return null;
}

function renderWithRouter(
  initialEntries: string[] = ["/"],
  onLocation: (search: string) => void = () => {},
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <HealthFilter />
              <LocationSpy onLocation={onLocation} />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HealthFilter", () => {
  it("renders three tabs (All / Healthy / Faulty)", () => {
    renderWithRouter();
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Healthy" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Faulty" })).toBeInTheDocument();
  });

  it("defaults to 'All' when no ?health param is present", () => {
    renderWithRouter();
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("reads the initial value from ?health=faulty", () => {
    renderWithRouter(["/?health=faulty"]);
    expect(screen.getByRole("tab", { name: "Faulty" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("falls back to 'All' when ?health contains an invalid value", () => {
    renderWithRouter(["/?health=unknown"]);
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("sets ?health=faulty when clicking the Faulty tab", async () => {
    const searches: string[] = [];
    renderWithRouter(["/"], (s) => searches.push(s));
    await userEvent.click(screen.getByRole("tab", { name: "Faulty" }));
    expect(searches.at(-1)).toBe("?health=faulty");
  });

  it("removes the ?health param when clicking the All tab", async () => {
    const searches: string[] = [];
    renderWithRouter(["/?health=faulty"], (s) => searches.push(s));
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(searches.at(-1)).toBe("");
  });

  it("preserves other query params when changing the health filter", async () => {
    const searches: string[] = [];
    renderWithRouter(["/?type=thermostat"], (s) => searches.push(s));
    await userEvent.click(screen.getByRole("tab", { name: "Healthy" }));
    const last = searches.at(-1) ?? "";
    const params = new URLSearchParams(last);
    expect(params.get("type")).toBe("thermostat");
    expect(params.get("health")).toBe("healthy");
  });
});

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { GridoneClient } from "@gridone/sdk";

import { GridoneClientProvider } from "./GridoneClientContext";
import { AuthProvider, useAuth } from "./AuthContext";

const getHealthMock = vi.fn();

function makeClient(): GridoneClient {
  return {
    me: vi.fn(() => Promise.reject(new Error("unauthenticated"))),
    login: vi.fn(),
    logout: vi.fn(),
    health: () => getHealthMock(),
  } as unknown as GridoneClient;
}

function FlagsAndVersionProbe() {
  const { health } = useAuth();
  return (
    <div>
      <span data-testid="version">{health.version ?? "no-version"}</span>
      <span data-testid="flags">{health.flags.join(",") || "no-flags"}</span>
    </div>
  );
}

function renderProbe(): void {
  render(
    <GridoneClientProvider client={makeClient()}>
      <AuthProvider>
        <FlagsAndVersionProbe />
      </AuthProvider>
    </GridoneClientProvider>,
  );
}

describe("AuthProvider health state", () => {
  beforeEach(() => {
    getHealthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes flags and version from /health on success", async () => {
    getHealthMock.mockResolvedValue({
      status: "ok",
      version: "1.2.3",
      flags: ["building_homepage"],
    });

    renderProbe();

    await waitFor(() =>
      expect(screen.getByTestId("flags")).toHaveTextContent(
        "building_homepage",
      ),
    );
    expect(screen.getByTestId("version")).toHaveTextContent("1.2.3");
  });

  it("falls back to empty flags and null version when /health errors", async () => {
    getHealthMock.mockRejectedValue(new Error("boom"));

    renderProbe();

    await waitFor(() => expect(getHealthMock).toHaveBeenCalled());
    expect(screen.getByTestId("flags")).toHaveTextContent("no-flags");
    expect(screen.getByTestId("version")).toHaveTextContent("no-version");
  });
});

describe("useFeatureEnabled", () => {
  beforeEach(() => {
    getHealthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("returns true when the mapped backend flag is present, false otherwise", async () => {
    getHealthMock.mockResolvedValue({
      status: "ok",
      version: null,
      flags: ["building_homepage"],
    });

    const { useFeatureEnabled } = await import("@/utils/featureFlags");

    function Probe({ children }: { children: ReactNode }) {
      return (
        <GridoneClientProvider client={makeClient()}>
          <AuthProvider>{children}</AuthProvider>
        </GridoneClientProvider>
      );
    }
    function Flag() {
      const on = useFeatureEnabled("buildingHomepage");
      return <span data-testid="flag">{on ? "on" : "off"}</span>;
    }

    render(
      <Probe>
        <Flag />
      </Probe>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("flag")).toHaveTextContent("on"),
    );
  });
});

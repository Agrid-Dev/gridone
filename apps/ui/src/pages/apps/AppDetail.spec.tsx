import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { GridoneError, type App } from "@gridone/sdk";
import { clearNavigation } from "@/lib/navigation";
import { createI18nMock } from "@/test/i18nMock";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    apps: { get: vi.fn(), enable: vi.fn(), disable: vi.fn() },
  },
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => mockClient,
}));
// Without `users:write` the configuration form, and its own queries, stay out.
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Apps",
    disabledBadge: "Disabled",
    "status.healthy": "Healthy",
    statusMessage: "Message from the app:",
    "errors.notFound": "Not found",
    "errors.default": "Something went wrong",
  }),
);

import AppDetail from "./AppDetail";

function makeApp(overrides: Partial<App> = {}): App {
  return {
    id: "app-1",
    user_id: "user-1",
    name: "Thermostat logo",
    description: "Puts the hotel's logo on the thermostats",
    api_url: "https://logo.example.com",
    icon: "image",
    status: "healthy",
    enabled: true,
    capabilities: { produces: [], reads: {}, commands: {} },
    health_url: "https://logo.example.com/health",
    enable_url: "https://logo.example.com/enable",
    ...overrides,
  };
}

function renderDetail() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/apps/app-1"]}>
        <Routes>
          <Route path="/apps/:appId" element={<AppDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clearNavigation();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AppDetail", () => {
  it("shows the app's status message under its health badge", async () => {
    mockClient.apps.get.mockResolvedValue(
      makeApp({ status_message: "Logo sent to 12 of 14 thermostats" }),
    );
    renderDetail();

    const message = await screen.findByText(
      "Logo sent to 12 of 14 thermostats",
    );
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    // Read out as the app's own words, apart from the description.
    expect(message).toHaveTextContent(
      "Message from the app: Logo sent to 12 of 14 thermostats",
    );
  });

  it("hides the message of a disabled app, as it hides its health", async () => {
    mockClient.apps.get.mockResolvedValue(
      makeApp({
        enabled: false,
        status_message: "Logo sent to 12 of 14 thermostats",
      }),
    );
    renderDetail();

    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(
      screen.queryByText("Logo sent to 12 of 14 thermostats"),
    ).not.toBeInTheDocument();
  });

  it("follows the message as the app reports progress", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockClient.apps.get
      .mockResolvedValueOnce(makeApp({ status_message: "Sent to 3 of 14" }))
      .mockResolvedValue(makeApp({ status_message: "Sent to 4 of 14" }));
    renderDetail();
    expect(await screen.findByText("Sent to 3 of 14")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(3_000));

    expect(await screen.findByText("Sent to 4 of 14")).toBeInTheDocument();
    expect(mockClient.apps.get).toHaveBeenCalledTimes(2);
  });

  describe("when the app cannot be shown", () => {
    // The error boundary logs what it catches.
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("shows the not-found page for an unknown app", async () => {
      mockClient.apps.get.mockRejectedValue(
        new GridoneError(404, "App 'app-1' not found"),
      );
      renderDetail();

      expect(await screen.findByText("Not found")).toBeInTheDocument();
    });

    it("shows the error page when the app fails to load", async () => {
      mockClient.apps.get.mockRejectedValue(
        new GridoneError(500, "Internal server error"),
      );
      renderDetail();

      expect(
        await screen.findByText("Something went wrong"),
      ).toBeInTheDocument();
    });
  });
});

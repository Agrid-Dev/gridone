import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { App } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockClient, mockToast } = vi.hoisted(() => ({
  mockClient: {
    apps: {
      list: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
    },
  },
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => mockClient,
}));
vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Apps",
    singular: "App",
    enable: "Enable",
    disable: "Disable",
    disabledBadge: "Disabled",
    "status.healthy": "Healthy",
    "status.registered": "Registered",
    "empty.title": "No app registered yet",
    "empty.description": "An app requests its own registration.",
    "empty.action": "View registration requests",
    "pendingCallout.title": "{{count}} pending registration requests",
    "pendingCallout.description": "An app stays inactive until accepted.",
    "pendingCallout.action": "Review",
    "requests.title": "Registration requests",
  }),
);

const permissions: { can: (permission: string) => boolean } = {
  can: () => true,
};
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) => permissions.can(permission),
}));

let pendingCount = 0;
vi.mock("@/hooks/usePendingAppRequests", () => ({
  usePendingAppRequests: () => ({ pendingCount }),
}));

import AppsList from "./AppsList";

function makeApp(overrides: Partial<App> = {}): App {
  return {
    id: "app-1",
    user_id: "user-1",
    name: "Weather",
    description: "Weather data for the building",
    api_url: "https://weather.example.com",
    icon: "🌦️",
    status: "healthy",
    enabled: true,
    capabilities: { produces: [], reads: {}, commands: {} },
    health_url: "https://weather.example.com/health",
    enable_url: "https://weather.example.com/enable",
    ...overrides,
  };
}

function renderList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppsList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions.can = () => true;
  pendingCount = 0;
  mockClient.apps.list.mockResolvedValue([makeApp()]);
});
afterEach(cleanup);

describe("AppsList", () => {
  // `mockClient` exposes no `users` resource: a component still reconstructing
  // the toggle state from `GET /users` would blow up rendering, not silently
  // fall back to "enabled".
  it("reads the toggle state off the app itself", async () => {
    mockClient.apps.list.mockResolvedValue([makeApp({ enabled: false })]);
    renderList();

    expect(await screen.findByText("Disabled")).toBeInTheDocument();
  });

  it("hides the health badge of a disabled app", async () => {
    mockClient.apps.list.mockResolvedValue([
      makeApp({ enabled: false, status: "healthy" }),
    ]);
    renderList();

    // The health loop probes disabled apps too, so "Disabled · Healthy" would
    // otherwise be reachable and read as a contradiction.
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
  });

  it("shows the health badge and a disable action for an enabled app", async () => {
    renderList();

    expect(await screen.findByText("Healthy")).toBeInTheDocument();
    expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Registration requests" }),
    ).toHaveAttribute("href", "/apps/requests");
  });

  it("enables a disabled app", async () => {
    mockClient.apps.list.mockResolvedValue([makeApp({ enabled: false })]);
    mockClient.apps.enable.mockResolvedValue(makeApp());
    renderList();

    await userEvent.click(
      await screen.findByRole("button", { name: "Enable" }),
    );

    await waitFor(() =>
      expect(mockClient.apps.enable).toHaveBeenCalledWith("app-1"),
    );
    expect(mockClient.apps.disable).not.toHaveBeenCalled();
  });

  it("explains that apps self-register when none is registered", async () => {
    mockClient.apps.list.mockResolvedValue([]);
    renderList();

    expect(
      await screen.findByText("No app registered yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("An app requests its own registration."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View registration requests" }),
    ).toHaveAttribute("href", "/apps/requests");
  });

  it("calls out pending registration requests, with a link to the inbox", async () => {
    pendingCount = 2;
    renderList();

    expect(
      await screen.findByText("2 pending registration requests"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/apps/requests",
    );
  });

  it("renders no callout when no request is pending", async () => {
    renderList();

    await screen.findByText("Weather");
    expect(
      screen.queryByRole("link", { name: "Review" }),
    ).not.toBeInTheDocument();
  });

  it("hides every action without the users:write permission", async () => {
    permissions.can = (permission) => permission !== "users:write";
    pendingCount = 2;
    renderList();

    await screen.findByText("Weather");
    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Registration requests" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review" }),
    ).not.toBeInTheDocument();
  });
});

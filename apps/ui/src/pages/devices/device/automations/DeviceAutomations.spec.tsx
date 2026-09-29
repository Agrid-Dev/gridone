import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Automation } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import DeviceAutomations from "./DeviceAutomations";

const { list, getDevice } = vi.hoisted(() => ({
  list: vi.fn(),
  getDevice: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    automations: { list },
    devices: { get: getDevice },
  }),
}));
vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => ({ id: "device-1", name: "Pump" }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.automations.title": "Automations",
    "deviceDetails.automations.intro":
      "Automations that observe or control {{device}}.",
    "deviceDetails.automations.browse": "View all automations",
    "deviceDetails.automations.emptyTitle": "No automations for this device",
    "deviceDetails.automations.emptyDescription":
      "No automation currently references this device.",
    enabledBadge: "Enabled",
    disabledBadge: "Disabled",
    "deactivation.breaker": "Circuit breaker open",
    "reasons.consecutive_failures": "Repeated executions failed.",
    "triggers.unknownDevice": "Unknown device",
  }),
);

function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "automation/1",
    name: "Morning start",
    description: "Start circulation before opening",
    trigger: { provider_id: "schedule", params: { cron: "0 8 * * *" } },
    branches: [
      {
        action: {
          provider_id: "command_template",
          params: { device_id: "device-1", attribute: "running", value: true },
        },
      },
    ],
    enabled: true,
    created_at: "2026-09-29T00:00:00Z",
    updated_at: "2026-09-29T00:00:00Z",
    ...overrides,
  };
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/devices/device-1/config/automations"]}>
        <Suspense fallback={<p>Loading</p>}>
          <Routes>
            <Route
              path="/devices/:deviceId/config/automations"
              element={<DeviceAutomations />}
            />
            <Route
              path="/automations/:automationId"
              element={<h1>Automation detail</h1>}
            />
            <Route path="/automations" element={<h1>All automations</h1>} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([]);
});
afterEach(cleanup);

describe("equipment automations", () => {
  it("requests only this device's automations and opens a listed automation", async () => {
    list.mockResolvedValue([automation()]);
    const user = setup();
    const link = await screen.findByRole("link", { name: /Morning start/ });
    expect(list).toHaveBeenCalledExactlyOnceWith({ device_id: "device-1" });
    expect(link).toHaveAttribute("href", "/automations/automation%2F1");
    expect(
      screen.getByText("Start circulation before opening"),
    ).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    await user.click(link);
    expect(
      await screen.findByRole("heading", { name: "Automation detail" }),
    ).toBeInTheDocument();
  });

  it("shows an explicit empty state and links to the automation section", async () => {
    const user = setup();
    expect(
      await screen.findByText("No automations for this device"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "View all automations" }),
    );
    expect(
      await screen.findByRole("heading", { name: "All automations" }),
    ).toBeInTheDocument();
  });

  it("keeps disabled and tripped automations visible with their recorded reason", async () => {
    list.mockResolvedValue([
      automation({
        id: "manual",
        name: "Manual stop",
        enabled: false,
        deactivation: {
          source: "operator",
          reason: "Pump maintenance",
          actor_id: "user",
          at: "2026-09-29T00:00:00Z",
        },
      }),
      automation({
        id: "tripped",
        name: "Tripped rule",
        enabled: false,
        deactivation: {
          source: "circuit_breaker",
          reason: "consecutive_failures",
          actor_id: "system",
          at: "2026-09-29T00:00:00Z",
        },
      }),
    ]);
    setup();
    expect(await screen.findByText("Pump maintenance")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText("Circuit breaker open")).toBeInTheDocument();
    expect(screen.getByText("Repeated executions failed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tripped rule/ })).toHaveAttribute(
      "href",
      "/automations/tripped",
    );
  });

  it("keeps an automation with a missing trigger device visible", async () => {
    getDevice.mockRejectedValue(new Error("unavailable"));
    list.mockResolvedValue([
      automation({
        trigger: {
          provider_id: "change_event",
          params: { device_id: "deleted", attribute: "temperature" },
        },
      }),
    ]);
    setup();
    expect(await screen.findByText(/Unknown device/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Morning start/ }),
    ).toBeInTheDocument();
  });
});

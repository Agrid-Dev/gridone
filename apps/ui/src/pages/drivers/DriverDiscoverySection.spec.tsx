import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import type { Driver, Transport } from "@gridone/sdk";

vi.mock("react-i18next", () =>
  createI18nMock({
    "discoverySection.title": "Discovery",
    "discoverySection.empty": "No network uses this driver's protocol.",
    "discoverySection.error": "Unable to load networks.",
  }),
);

const permissions = new Set<string>();
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) => permissions.has(permission),
}));

const mockUseDriverDiscovery = vi.fn();
vi.mock("./useDriverDiscovery", () => ({
  useDriverDiscovery: (...args: unknown[]) => mockUseDriverDiscovery(...args),
}));

import { DriverDiscoverySection } from "./DriverDiscoverySection";

const driver = {
  id: "drv-1",
  transport: "mqtt",
  device_config: [],
  attributes: [],
  discovery: {},
  presentation_revision: null,
} as unknown as Driver;

const network = (id: string, name: string) =>
  ({ id, name, protocol: "mqtt" }) as unknown as Transport;

beforeEach(() => {
  permissions.clear();
  permissions.add("transports:write");
  mockUseDriverDiscovery.mockReset();
});

afterEach(() => cleanup());

describe("DriverDiscoverySection", () => {
  it("shows one switch per compatible network reflecting its state", () => {
    mockUseDriverDiscovery.mockReturnValue({
      transports: [
        {
          transport: network("m1", "Site broker"),
          enabled: true,
          loading: false,
        },
        {
          transport: network("m2", "Lab broker"),
          enabled: false,
          loading: false,
        },
      ],
      setEnabled: vi.fn(),
      loading: false,
      error: false,
    });
    render(<DriverDiscoverySection driver={driver} />);

    expect(screen.getByText("Discovery")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Site broker" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: "Lab broker" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("toggles discovery for the clicked network", () => {
    const setEnabled = vi.fn();
    mockUseDriverDiscovery.mockReturnValue({
      transports: [
        {
          transport: network("m1", "Site broker"),
          enabled: true,
          loading: false,
        },
      ],
      setEnabled,
      loading: false,
      error: false,
    });
    render(<DriverDiscoverySection driver={driver} />);

    fireEvent.click(screen.getByRole("switch", { name: "Site broker" }));
    expect(setEnabled).toHaveBeenCalledWith("m1", false);
  });

  it("is read-only without transports:write", () => {
    permissions.clear();
    mockUseDriverDiscovery.mockReturnValue({
      transports: [
        {
          transport: network("m1", "Site broker"),
          enabled: false,
          loading: false,
        },
      ],
      setEnabled: vi.fn(),
      loading: false,
      error: false,
    });
    render(<DriverDiscoverySection driver={driver} />);

    expect(screen.getByRole("switch", { name: "Site broker" })).toBeDisabled();
  });

  it("explains when no network speaks the driver's protocol", () => {
    mockUseDriverDiscovery.mockReturnValue({
      transports: [],
      setEnabled: vi.fn(),
      loading: false,
      error: false,
    });
    render(<DriverDiscoverySection driver={driver} />);

    expect(
      screen.getByText("No network uses this driver's protocol."),
    ).toBeInTheDocument();
  });
});

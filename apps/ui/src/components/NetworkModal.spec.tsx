import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { type Device } from "@/api/devices";
import type { Transport } from "@/api/transports";

const { mockUseDevicesList } = vi.hoisted(() => ({
  mockUseDevicesList: vi.fn(),
}));

vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => mockUseDevicesList(),
}));

// Stub TransportForm — its internals (config schemas query + form state) are
// out of scope here; we only want to verify the modal wrapping (title, banner,
// open/close wiring).
vi.mock("@/pages/transports/form", () => ({
  default: ({
    lockedProtocol,
    transport,
  }: {
    lockedProtocol?: string;
    transport?: Transport;
  }) => (
    <div data-testid="transport-form">
      {lockedProtocol && (
        <span data-testid="locked-protocol">{lockedProtocol}</span>
      )}
      {transport && (
        <span data-testid="editing-transport-id">{transport.id}</span>
      )}
    </div>
  ),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    createTitle: "Create network",
    editTitle: "Edit network",
    createSubtitle: "Configure a new connection",
    editSubtitle: "Update network settings",
    linkedDevicesWarning_one: "Editing this network affects {{count}} device.",
    linkedDevicesWarning_other:
      "Editing this network affects {{count}} devices.",
    linkedDevicesWarning: "Editing this network affects {{count}} devices.",
  }),
);

import { NetworkModal } from "./NetworkModal";

function makeDevice(id: string, transportId: string): Device {
  return {
    id,
    name: id,
    type: null,
    tags: {},
    driverId: "drv",
    transportId,
    config: {},
    attributes: {},
    isFaulty: false,
  };
}

function makeTransport(id: string, name: string): Transport {
  return {
    id,
    name,
    protocol: "mqtt",
    config: {},
    connectionState: { status: "idle" },
  };
}

beforeEach(() => {
  mockUseDevicesList.mockReturnValue({ devices: [], loading: false });
});

afterEach(() => {
  cleanup();
  mockUseDevicesList.mockReset();
});

describe("NetworkModal", () => {
  it("renders nothing when closed", () => {
    render(
      <NetworkModal
        open={false}
        onClose={() => {}}
        mode="create"
        protocol="mqtt"
        onSubmitted={() => {}}
      />,
    );
    expect(screen.queryByTestId("transport-form")).not.toBeInTheDocument();
  });

  it("renders create title and locked protocol in create mode", () => {
    render(
      <NetworkModal
        open
        onClose={() => {}}
        mode="create"
        protocol="mqtt"
        onSubmitted={() => {}}
      />,
    );
    expect(screen.getByText("Create network")).toBeInTheDocument();
    expect(screen.getByTestId("locked-protocol")).toHaveTextContent("mqtt");
  });

  it("renders edit title and passes the editing transport in edit mode", () => {
    const transport = makeTransport("tr-1", "Home Network");
    render(
      <NetworkModal
        open
        onClose={() => {}}
        mode="edit"
        transport={transport}
        onSubmitted={() => {}}
      />,
    );
    expect(screen.getByText("Edit network")).toBeInTheDocument();
    expect(screen.getByTestId("editing-transport-id")).toHaveTextContent(
      "tr-1",
    );
  });

  it("shows the linked-devices warning banner with the correct count in edit mode", () => {
    const transport = makeTransport("tr-1", "Home Network");
    mockUseDevicesList.mockReturnValue({
      devices: [
        makeDevice("d1", "tr-1"),
        makeDevice("d2", "tr-1"),
        makeDevice("d3", "tr-2"), // different network — should not be counted
      ],
      loading: false,
    });
    render(
      <NetworkModal
        open
        onClose={() => {}}
        mode="edit"
        transport={transport}
        onSubmitted={() => {}}
      />,
    );
    expect(
      screen.getByText(/Editing this network affects 2 device/i),
    ).toBeInTheDocument();
  });

  it("does not render the banner when no devices reference the network", () => {
    const transport = makeTransport("tr-1", "Home Network");
    mockUseDevicesList.mockReturnValue({
      devices: [makeDevice("d1", "tr-2")],
      loading: false,
    });
    render(
      <NetworkModal
        open
        onClose={() => {}}
        mode="edit"
        transport={transport}
        onSubmitted={() => {}}
      />,
    );
    expect(
      screen.queryByText(/Editing this network affects/i),
    ).not.toBeInTheDocument();
  });
});

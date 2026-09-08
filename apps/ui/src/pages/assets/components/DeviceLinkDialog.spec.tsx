import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Asset, Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockClient, mockToast } = vi.hoisted(() => ({
  mockClient: {
    devices: { list: vi.fn(), assignAssets: vi.fn() },
    assets: { getTreeWithDevices: vi.fn() },
  },
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => mockClient,
}));
vi.mock("sonner", () => ({ toast: mockToast }));
vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.selectDevices": "Select devices",
    "devices.selectHint": "Already-linked devices are hidden.",
    "devices.searchDevices": "Search",
    "devices.selectAllMatching": "Select all matching",
    "devices.selectedCount": "{{count}} selected",
    "devices.linkCount": "Link {{count}} devices",
    "devices.linkedCount": "{{count}} devices linked",
    "devices.linkFailed": "{{count}} devices could not be linked",
    "devices.noZone": "No zone",
    "devices.loadError": "Devices could not be loaded",
    "common:common.cancel": "Cancel",
    "common:common.noResults": "No results",
  }),
);

// Imports below this line must come after the vi.mock calls.
import { DeviceLinkDialog } from "./DeviceLinkDialog";

const ATTIC: Asset = {
  id: "attic",
  parent_id: null,
  type: "room",
  name: "Attic",
  path: ["attic"],
};

function device(id: string, name: string, assetId?: string): Device {
  return {
    id,
    name,
    tags: assetId ? { asset_id: assetId } : {},
    attributes: {},
    config: {},
    driver_id: "drv",
    transport_id: "trp",
    is_faulty: false,
  } as Device;
}

const DEVICES = [
  device("dev-a", "Alpha probe"),
  device("dev-b", "Beta probe", "attic"),
  device("dev-c", "Gamma probe"),
  device("dev-linked", "Already here"),
];

function renderDialog(props: Partial<{ existingDeviceIds: string[] }> = {}) {
  mockClient.devices.list.mockResolvedValue(DEVICES);
  mockClient.assets.getTreeWithDevices.mockResolvedValue([
    { ...ATTIC, children: [], devices: [] },
  ]);
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeviceLinkDialog
        assetId="lobby"
        open
        onOpenChange={onOpenChange}
        existingDeviceIds={props.existingDeviceIds ?? ["dev-linked"]}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange, view };
}

const linkButton = () => screen.getByRole("button", { name: /^Link/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeviceLinkDialog", () => {
  it("lists the devices that are not already in the zone, with their current zone", async () => {
    renderDialog();

    expect(await screen.findByLabelText("Alpha probe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Already here")).not.toBeInTheDocument();
    expect(screen.getByText("Attic")).toBeInTheDocument();
    expect(screen.getAllByText("No zone")).toHaveLength(2);
  });

  it("links every checked device in one call", async () => {
    mockClient.devices.assignAssets.mockResolvedValue({
      results: [
        { device_id: "dev-a", asset_id: "lobby", status: "applied" },
        { device_id: "dev-c", asset_id: "lobby", status: "applied" },
      ],
    });
    const { onOpenChange } = renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText("Alpha probe"));
    await user.click(screen.getByLabelText("Gamma probe"));
    await user.click(linkButton());

    await waitFor(() =>
      expect(mockClient.devices.assignAssets).toHaveBeenCalledWith([
        { device_id: "dev-a", asset_id: "lobby" },
        { device_id: "dev-c", asset_id: "lobby" },
      ]),
    );
    expect(mockToast.success).toHaveBeenCalledWith("2 devices linked");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps devices selected while the search narrows the list", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText("Alpha probe"));
    await user.type(screen.getByPlaceholderText("Search"), "Gamma");

    expect(screen.queryByLabelText("Alpha probe")).not.toBeInTheDocument();
    expect(linkButton()).toHaveTextContent("Link 1 devices");

    await user.click(screen.getByLabelText("Gamma probe"));
    expect(linkButton()).toHaveTextContent("Link 2 devices");
  });

  it("selects only the matching devices, leaving the rest of the basket alone", async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText("Alpha probe"));
    await user.type(screen.getByPlaceholderText("Search"), "probe");
    await user.clear(screen.getByPlaceholderText("Search"));
    await user.type(screen.getByPlaceholderText("Search"), "Beta");
    await user.click(screen.getByLabelText("Select all matching"));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("empties the basket when the dialog closes", async () => {
    const { view } = renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText("Alpha probe"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <DeviceLinkDialog
          assetId="lobby"
          open={false}
          onOpenChange={vi.fn()}
          existingDeviceIds={["dev-linked"]}
        />
      </QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <DeviceLinkDialog
          assetId="lobby"
          open
          onOpenChange={vi.fn()}
          existingDeviceIds={["dev-linked"]}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("0 selected")).toBeInTheDocument();
  });

  it("cannot submit an empty selection", async () => {
    renderDialog();

    await screen.findByLabelText("Alpha probe");
    expect(linkButton()).toBeDisabled();
  });

  it("reports the devices the server refused", async () => {
    mockClient.devices.assignAssets.mockResolvedValue({
      results: [
        {
          device_id: "dev-a",
          asset_id: "lobby",
          status: "failed",
          error: "Device not found",
        },
      ],
    });
    renderDialog();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText("Alpha probe"));
    await user.click(linkButton());

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith(
        "1 devices could not be linked",
      ),
    );
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("says so when the device list cannot be loaded", async () => {
    mockClient.devices.list.mockRejectedValue(new Error("boom"));
    mockClient.assets.getTreeWithDevices.mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DeviceLinkDialog
          assetId="lobby"
          open
          onOpenChange={vi.fn()}
          existingDeviceIds={[]}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Devices could not be loaded"),
    ).toBeInTheDocument();
  });
});

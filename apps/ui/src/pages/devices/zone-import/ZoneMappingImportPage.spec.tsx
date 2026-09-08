import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { Asset, Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockClient, mockToast, mockDownloadCsv } = vi.hoisted(() => ({
  mockClient: {
    devices: { list: vi.fn(), assignAssets: vi.fn() },
    assets: { getTreeWithDevices: vi.fn() },
  },
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockDownloadCsv: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => mockClient,
}));
vi.mock("sonner", () => ({ toast: mockToast }));
vi.mock("@/lib/csv", () => ({ downloadCsv: mockDownloadCsv }));
vi.mock("react-i18next", () =>
  createI18nMock({
    "zoneImport.title": "Import zone mapping",
    "zoneImport.caption": "Bulk assignment",
    "zoneImport.backToDevices": "Back to devices",
    "zoneImport.downloadTemplate": "Download template",
    "zoneImport.downloadZones": "Download zone IDs",
    "zoneImport.formatHint": "The file needs the columns",
    "zoneImport.templateHint": "The template lists every device.",
    "zoneImport.chooseFile": "Choose a CSV file",
    "zoneImport.replaceFile": "Choose another file",
    "zoneImport.fileInputLabel": "Zone mapping CSV file",
    "zoneImport.selectedFile": "{{filename}} — {{count}} rows",
    "zoneImport.fileErrors.missingColumns": "Missing columns",
    "zoneImport.rowErrors.unknownZone": "No zone with this ID.",
    "zoneImport.table.line": "Line",
    "zoneImport.table.device": "Device",
    "zoneImport.table.currentZone": "Current zone",
    "zoneImport.table.targetZone": "New zone",
    "zoneImport.table.status": "Change",
    "zoneImport.status.link": "Link",
    "zoneImport.status.move": "Move",
    "zoneImport.status.unchanged": "Unchanged",
    "zoneImport.status.skipped": "Ignored",
    "zoneImport.status.invalid": "Invalid",
    "zoneImport.blocked": "Fix {{count}} invalid rows before importing.",
    "zoneImport.skippedNote":
      "{{count}} lines have no zone and will be ignored.",
    "zoneImport.apply": "Import {{count}} assignments",
    "zoneImport.results.title": "Import results",
    "zoneImport.results.applied": "{{count}} devices moved",
    "zoneImport.results.unchanged": "{{count}} devices already in their zone",
    "zoneImport.results.failed": "{{count}} devices failed",
    "zoneImport.results.retry": "Retry {{count}} failures",
    "zoneImport.results.newImport": "Import another file",
    "common:common.cancel": "Cancel",
  }),
);

// Imports below this line must come after the vi.mock calls.
import ZoneMappingImportPage from "./ZoneMappingImportPage";

const LOBBY: Asset = {
  id: "lobby",
  parent_id: null,
  type: "room",
  name: "Lobby",
  path: ["lobby"],
};
const ATTIC: Asset = { ...LOBBY, id: "attic", name: "Attic", path: ["attic"] };

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

function renderPage() {
  mockClient.devices.list.mockResolvedValue([
    device("dev-a", "Alpha probe"),
    device("dev-b", "Beta probe", "attic"),
  ]);
  mockClient.assets.getTreeWithDevices.mockResolvedValue([
    { ...LOBBY, children: [], devices: [] },
    { ...ATTIC, children: [], devices: [] },
  ]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ZoneMappingImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function upload(user: ReturnType<typeof userEvent.setup>, csv: string) {
  const file = new File([csv], "mapping.csv", { type: "text/csv" });
  await user.upload(screen.getByLabelText("Zone mapping CSV file"), file);
}

const importButton = () => screen.getByRole("button", { name: /^Import \d/ });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ZoneMappingImportPage", () => {
  it("previews each row with its current and proposed zone", async () => {
    renderPage();
    const user = userEvent.setup();

    await upload(user, "device_id,asset_id\ndev-a,lobby\ndev-b,lobby\n");

    expect(await screen.findByText("Alpha probe")).toBeInTheDocument();
    expect(screen.getByText("Link")).toBeInTheDocument();
    expect(screen.getByText("Move")).toBeInTheDocument();
    expect(screen.getByText("Attic")).toBeInTheDocument();
    expect(importButton()).toHaveTextContent("Import 2 assignments");
  });

  it("blocks the whole import on one invalid row", async () => {
    renderPage();
    const user = userEvent.setup();

    // A valid row alongside the bad one: the batch is not empty, and is still
    // refused — an operator fixes the file rather than importing half of it.
    await upload(user, "device_id,asset_id\ndev-a,lobby\ndev-b,ghost-zone\n");

    expect(
      await screen.findByText("No zone with this ID."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fix 1 invalid rows before importing."),
    ).toBeInTheDocument();
    expect(importButton()).toHaveTextContent("Import 1 assignments");
    expect(importButton()).toBeDisabled();
  });

  it("rejects a file without the expected columns", async () => {
    renderPage();
    const user = userEvent.setup();

    await upload(user, "id,zone\ndev-a,lobby\n");

    expect(await screen.findByText("Missing columns")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Import \d/ })).toBeNull();
  });

  it("applies the mapping and reports the batch outcome", async () => {
    mockClient.devices.assignAssets.mockResolvedValue({
      results: [
        { device_id: "dev-a", asset_id: "lobby", status: "applied" },
        { device_id: "dev-b", asset_id: "lobby", status: "unchanged" },
      ],
    });
    renderPage();
    const user = userEvent.setup();

    await upload(user, "device_id,asset_id\ndev-a,lobby\ndev-b,lobby\n");
    await user.click(await screen.findByRole("button", { name: /^Import \d/ }));

    expect(await screen.findByText("Import results")).toBeInTheDocument();
    expect(mockClient.devices.assignAssets).toHaveBeenCalledExactlyOnceWith([
      { device_id: "dev-a", asset_id: "lobby" },
      { device_id: "dev-b", asset_id: "lobby" },
    ]);
    expect(screen.getByText("1 devices moved")).toBeInTheDocument();
    expect(
      screen.getByText("1 devices already in their zone"),
    ).toBeInTheDocument();
  });

  it("retries the failed assignments alone", async () => {
    mockClient.devices.assignAssets.mockResolvedValue({
      results: [
        { device_id: "dev-a", asset_id: "lobby", status: "applied" },
        {
          device_id: "dev-b",
          asset_id: "lobby",
          status: "failed",
          error: "Device not found",
        },
      ],
    });
    renderPage();
    const user = userEvent.setup();

    await upload(user, "device_id,asset_id\ndev-a,lobby\ndev-b,lobby\n");
    await user.click(await screen.findByRole("button", { name: /^Import \d/ }));
    expect(await screen.findByText(/Device not found/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry 1 failures" }));

    await waitFor(() =>
      expect(mockClient.devices.assignAssets).toHaveBeenLastCalledWith([
        { device_id: "dev-b", asset_id: "lobby" },
      ]),
    );
  });

  it("downloads a template holding the fleet and its current zones", async () => {
    renderPage();
    const user = userEvent.setup();
    // The devices query backs the template, so wait for it to land.
    await screen.findByText("The template lists every device.");

    await user.click(screen.getByRole("button", { name: "Download template" }));

    await waitFor(() =>
      expect(mockDownloadCsv).toHaveBeenCalledWith(
        ["device_id", "name", "asset_id"],
        [
          ["dev-a", "Alpha probe", ""],
          ["dev-b", "Beta probe", "attic"],
        ],
        "zone-mapping.csv",
      ),
    );
  });

  it("downloads the zone ids to paste into that template", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText("The template lists every device.");

    await user.click(screen.getByRole("button", { name: "Download zone IDs" }));

    await waitFor(() =>
      expect(mockDownloadCsv).toHaveBeenCalledWith(
        ["asset_id", "zone"],
        [
          ["attic", "Attic"],
          ["lobby", "Lobby"],
        ],
        "zones.csv",
      ),
    );
  });

  it("reports the rows it will ignore, without blocking the import", async () => {
    renderPage();
    const user = userEvent.setup();

    await upload(user, "device_id,asset_id\ndev-a,lobby\ndev-b,\n");

    expect(await screen.findByText("Ignored")).toBeInTheDocument();
    expect(
      screen.getByText("1 lines have no zone and will be ignored."),
    ).toBeInTheDocument();
    expect(importButton()).toHaveTextContent("Import 1 assignments");
    expect(importButton()).toBeEnabled();
  });
});

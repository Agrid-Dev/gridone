import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type BuildingModel } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockClient, mockToast } = vi.hoisted(() => ({
  mockClient: {
    assets: {
      getModel: vi.fn(),
      uploadModel: vi.fn(),
      deleteModel: vi.fn(),
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
    "editPage.model.title": "3D model",
    "editPage.model.description": "Upload the building's IFC file.",
    "editPage.model.upload": "Upload IFC",
    "editPage.model.replace": "Replace",
    "editPage.model.fileInputLabel": "IFC file",
    "editPage.model.empty": "No 3D model yet.",
    "editPage.model.uploadStarted": "Conversion started.",
    "editPage.model.processing": 'Converting "{{filename}}"…',
    "editPage.model.ready": "3D scene ready",
    "editPage.model.failed": "Conversion failed",
    "editPage.model.failedHint": "Fix the file and upload again.",
    "editPage.model.fileFact": "File",
    "editPage.model.sizeFact": "Size",
    "editPage.model.sizeValue": "{{size}} MB",
    "editPage.model.contentFact": "Content",
    "editPage.model.contentValue": "{{floors}} floors · {{rooms}} rooms",
    "editPage.model.updatedFact": "Updated",
    "editPage.model.noSpacesNotice": "No rooms in this model.",
    "editPage.model.delete": "Delete model",
    "editPage.model.deleted": "3D model deleted.",
    "editPage.model.deleteConfirmTitle": "Delete 3D model",
    "editPage.model.deleteConfirmDetails": "Delete the model?",
    "common:common.cancel": "Cancel",
    "common:common.unknown": "Unknown",
    "common.cancel": "Cancel",
  }),
);

import { BuildingModelCard } from "./BuildingModelCard";

function makeModel(overrides: Partial<BuildingModel> = {}): BuildingModel {
  return {
    asset_id: "b1",
    status: "ready",
    filename: "hq.ifc",
    ifc_size: 2_000_000,
    glb_size: 500_000,
    error: null,
    storeys: [{ global_id: "s1", name: "Level 0", elevation: 0 }],
    spaces: [
      {
        global_id: "sp1",
        name: "Room 001",
        storey_global_id: "s1",
        storey_name: "Level 0",
      },
    ],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  } as BuildingModel;
}

function renderCard(props: { canWrite?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BuildingModelCard assetId="b1" canWrite={props.canWrite ?? true} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BuildingModelCard", () => {
  it("shows the empty state and uploads a picked file", async () => {
    mockClient.assets.getModel.mockRejectedValue(
      new GridoneError(404, "Asset 'b1' has no 3D model"),
    );
    mockClient.assets.uploadModel.mockResolvedValue(
      makeModel({ status: "processing", glb_size: null }),
    );
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText("No 3D model yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload IFC" }),
    ).toBeInTheDocument();

    const file = new File(["ifc-data"], "hq.ifc", { type: "" });
    await user.upload(screen.getByLabelText("IFC file"), file);

    await waitFor(() =>
      expect(mockClient.assets.uploadModel).toHaveBeenCalledWith(
        "b1",
        file,
        "hq.ifc",
      ),
    );
    expect(mockToast.success).toHaveBeenCalledWith("Conversion started.");
  });

  it("shows the processing state without action buttons", async () => {
    mockClient.assets.getModel.mockResolvedValue(
      makeModel({ status: "processing", glb_size: null }),
    );
    renderCard();

    expect(await screen.findByText('Converting "hq.ifc"…')).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete model" }),
    ).not.toBeInTheDocument();
  });

  it("shows the failure reason returned by the server", async () => {
    mockClient.assets.getModel.mockResolvedValue(
      makeModel({
        status: "failed",
        error: "The uploaded file is not a valid IFC file.",
        glb_size: null,
      }),
    );
    renderCard();

    expect(await screen.findByText("Conversion failed")).toBeInTheDocument();
    expect(
      screen.getByText("The uploaded file is not a valid IFC file."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeInTheDocument();
  });

  it("shows the ready facts and deletes after confirmation", async () => {
    mockClient.assets.getModel.mockResolvedValue(makeModel());
    mockClient.assets.deleteModel.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText("3D scene ready")).toBeInTheDocument();
    expect(screen.getByText("hq.ifc")).toBeInTheDocument();
    expect(screen.getByText("1 floors · 1 rooms")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete model" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete model" }),
    );

    await waitFor(() =>
      expect(mockClient.assets.deleteModel).toHaveBeenCalledWith("b1"),
    );
    expect(mockToast.success).toHaveBeenCalledWith("3D model deleted.");
  });

  it("warns when the model has no spaces", async () => {
    mockClient.assets.getModel.mockResolvedValue(makeModel({ spaces: [] }));
    renderCard();

    expect(
      await screen.findByText("No rooms in this model."),
    ).toBeInTheDocument();
  });

  it("hides write actions for read-only users", async () => {
    mockClient.assets.getModel.mockResolvedValue(makeModel());
    renderCard({ canWrite: false });

    expect(await screen.findByText("3D scene ready")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Replace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete model" }),
    ).not.toBeInTheDocument();
  });
});

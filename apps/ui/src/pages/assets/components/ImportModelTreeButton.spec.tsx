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
import { createI18nMock } from "@/test/i18nMock";

const { mockClient, mockToast } = vi.hoisted(() => ({
  mockClient: {
    assets: {
      importModelTree: vi.fn(),
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
    "editPage.model.import": "Import tree from IFC",
    "editPage.model.importConfirmTitle": "Replace the building tree",
    "editPage.model.importConfirmDetails":
      "The subtree will be replaced and device links cleared.",
    "editPage.model.importConfirm": "Replace tree",
    "editPage.model.importDoneTitle": "Tree imported",
    "editPage.model.importDoneDetails":
      "The building tree now mirrors the 3D model.",
    "editPage.model.importedFloors": "{{count}} floors created",
    "editPage.model.importedRooms": "{{count}} rooms created",
    "editPage.model.importedDevicesUnlinked": "{{count}} devices unlinked",
    "editPage.model.importClose": "Close",
    "common:common.cancel": "Cancel",
  }),
);

import { ImportModelTreeButton } from "./ImportModelTreeButton";

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportModelTreeButton assetId="b1" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportModelTreeButton", () => {
  it("imports after confirmation and shows the report", async () => {
    mockClient.assets.importModelTree.mockResolvedValue({
      floors_created: 3,
      rooms_created: 12,
      devices_unlinked: 5,
    });
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole("button", { name: "Import tree from IFC" }),
    );
    const dialog = within(await screen.findByRole("alertdialog"));
    expect(dialog.getByText("Replace the building tree")).toBeInTheDocument();
    expect(
      dialog.getByText(
        "The subtree will be replaced and device links cleared.",
      ),
    ).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Replace tree" }));

    expect(mockClient.assets.importModelTree).toHaveBeenCalledWith("b1");
    expect(await dialog.findByText("Tree imported")).toBeInTheDocument();
    expect(dialog.getByText("3 floors created")).toBeInTheDocument();
    expect(dialog.getByText("12 rooms created")).toBeInTheDocument();
    expect(dialog.getByText("5 devices unlinked")).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole("button", { name: "Import tree from IFC" }),
    );
    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    expect(mockClient.assets.importModelTree).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog open and toasts on API error", async () => {
    mockClient.assets.importModelTree.mockRejectedValue(
      new Error("Import failed server-side"),
    );
    const user = userEvent.setup();
    renderButton();

    await user.click(
      screen.getByRole("button", { name: "Import tree from IFC" }),
    );
    const dialog = within(await screen.findByRole("alertdialog"));
    await user.click(dialog.getByRole("button", { name: "Replace tree" }));

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Import failed server-side"),
    );
    // Still on the confirmation view: the user can retry or cancel.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Replace tree" }),
    ).toBeInTheDocument();
    expect(dialog.queryByText("Tree imported")).not.toBeInTheDocument();
  });
});

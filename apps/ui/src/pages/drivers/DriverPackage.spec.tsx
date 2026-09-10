import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { GridoneError } from "@gridone/sdk";
import type { ReactNode } from "react";
import { createI18nMock } from "@/test/i18nMock";
import DriverCreate from "./DriverCreate";
import DriverEdit from "./DriverEdit";
import { DriverPresentationStatus } from "./DriverPresentationStatus";
import { useExportDriverPackage } from "./useDriverPackage";

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  presentation: vi.fn(),
  export: vi.fn(),
  download: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "package.line": "Line {{line}}",
    "package.column": "Column {{column}}",
  }),
);
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    drivers: {
      installPackage: mocks.install,
      getPresentation: mocks.presentation,
      exportPackage: mocks.export,
    },
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("./useDrivers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useDrivers")>()),
  useDriverFromRoute: () => ({ id: "pump" }),
}));
vi.mock("@/lib/download", () => ({ downloadBlob: mocks.download }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
}));

function mount(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const submitButton = () =>
  screen.getByRole("button", { name: /package\.(install|replace)$/ });
const yamlInput = () => screen.getByRole("textbox", { name: "package.yaml" });
const fileInput = () =>
  screen.getByLabelText("package.file", { selector: "input[type=file]" });

async function selectFile(name = "pump.zip") {
  await userEvent.click(screen.getByRole("radio", { name: "package.file" }));
  const file = new File(["package contents"], name, {
    type: "application/octet-stream",
  });
  await userEvent.upload(fileInput(), file);
  return file;
}
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}
const status = (revision = "revision-1") => ({
  status: "unavailable",
  revision,
  diagnostics: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.install.mockResolvedValue({ id: "pump" });
  mocks.presentation.mockResolvedValue(status());
});
afterEach(cleanup);

describe("driver package import", () => {
  it("retains pasted YAML creation and sends the exact document as YAML", async () => {
    mount(<DriverCreate />);
    const yaml = "id: pump\ntransport: http\n";
    fireEvent.change(yamlInput(), { target: { value: yaml } });
    await userEvent.click(submitButton());
    await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    const [id, body] = mocks.install.mock.calls[0];
    expect(id).toBe("pump");
    expect(body.type).toBe("application/yaml");
    expect(await readBlob(body)).toBe(yaml);
  });

  it.each([
    ["driver.yaml", "application/yaml"],
    ["driver.yml", "application/yaml"],
    ["driver.ZIP", "application/zip"],
  ])(
    "uploads %s with an explicit driver id and correct MIME",
    async (filename, mime) => {
      mount(<DriverCreate />);
      // Case-insensitive extensions are accepted by the server; bypass the browser picker filter.
      await userEvent.click(
        screen.getByRole("radio", { name: "package.file" }),
      );
      fireEvent.change(fileInput(), {
        target: { files: [new File(["contents"], filename)] },
      });
      await userEvent.type(
        screen.getByRole("textbox", { name: "package.driverId" }),
        "pump",
      );
      await userEvent.click(submitButton());
      await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
      const [id, body] = mocks.install.mock.calls[0];
      expect(id).toBe("pump");
      expect(body.type).toBe(mime);
      expect(await readBlob(body)).toBe("contents");
    },
  );

  it("requires the file and explicit id before uploading", async () => {
    mount(<DriverCreate />);
    await userEvent.click(screen.getByRole("radio", { name: "package.file" }));
    await userEvent.click(submitButton());
    expect(await screen.findByText("package.fileRequired")).toBeVisible();
    expect(screen.getByText("package.idRequired")).toBeVisible();
    expect(fileInput()).toHaveAttribute("aria-invalid", "true");
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it.each([
    ["", "package.yamlRequired"],
    ["transport: http", "package.yamlIdRequired"],
  ])("rejects YAML without an id: %s", async (yaml, error) => {
    mount(<DriverCreate />);
    fireEvent.change(yamlInput(), { target: { value: yaml } });
    await userEvent.click(submitButton());
    expect(await screen.findByText(error)).toBeVisible();
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it("requires selecting a file again after switching sources", async () => {
    mount(<DriverCreate />);
    await selectFile();
    await userEvent.type(
      screen.getByRole("textbox", { name: "package.driverId" }),
      "pump",
    );
    await userEvent.click(screen.getByRole("radio", { name: "package.yaml" }));
    await userEvent.click(screen.getByRole("radio", { name: "package.file" }));
    await userEvent.click(submitButton());
    expect(await screen.findByText("package.fileRequired")).toBeVisible();
    expect(mocks.install).not.toHaveBeenCalled();
  });

  it("keeps the file and renders structured diagnostics after a rejected import", async () => {
    mocks.install.mockRejectedValue(
      new GridoneError(422, [
        {
          code: "missing_binding",
          path: "/page/binding",
          line: 12,
          column: 7,
          message: "Binding is not declared.",
        },
      ]),
    );
    mount(<DriverCreate />);
    const file = await selectFile();
    await userEvent.type(
      screen.getByRole("textbox", { name: "package.driverId" }),
      "pump",
    );
    await userEvent.click(submitButton());
    expect(await screen.findByText("missing_binding")).toBeVisible();
    expect(screen.getByText("/page/binding")).toBeVisible();
    expect(screen.getByText(/Line 12/)).toHaveTextContent("Column 7");
    expect(screen.getByText("Binding is not declared.")).toBeVisible();
    expect((fileInput() as HTMLInputElement).files?.[0]).toBe(file);
    expect(submitButton()).toBeEnabled();
  });

  it.each([
    new GridoneError(500, [{ code: "internal", message: "/secret/path" }]),
    new GridoneError(422, [{ code: 1, message: "/secret/path" }]),
  ])(
    "uses a generic message for internal or malformed diagnostics",
    async (error) => {
      mocks.install.mockRejectedValue(error);
      mount(<DriverCreate />);
      fireEvent.change(yamlInput(), { target: { value: "id: pump" } });
      await userEvent.click(submitButton());
      expect(await screen.findByText("common:errors.default")).toBeVisible();
      expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    },
  );
});

describe("conditional package replacement", () => {
  it("does not upload a second package while one installation is pending", async () => {
    let resolve!: (value: { id: string }) => void;
    mocks.install.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount(<DriverEdit />);
    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.change(yamlInput(), { target: { value: "id: pump" } });
    await userEvent.click(submitButton());
    await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "package.installing" }),
    ).toBeDisabled();
    fireEvent.submit(yamlInput().closest("form")!);
    await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
    resolve({ id: "pump" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "package.replace" }),
      ).toBeEnabled(),
    );
  });

  it("waits for the public revision before permitting an upload", async () => {
    let resolve!: (value: ReturnType<typeof status>) => void;
    mocks.presentation.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount(<DriverEdit />);
    fireEvent.change(yamlInput(), { target: { value: "id: pump" } });
    expect(submitButton()).toBeDisabled();
    fireEvent.submit(yamlInput().closest("form")!);
    await waitFor(() =>
      expect(screen.queryByText("package.loading")).toBeVisible(),
    );
    expect(mocks.install).not.toHaveBeenCalled();
    resolve(status());
    await waitFor(() => expect(submitButton()).toBeEnabled());
    await userEvent.click(submitButton());
    await waitFor(() =>
      expect(mocks.install).toHaveBeenCalledWith("pump", expect.any(Blob), {
        expectedRevision: "revision-1",
      }),
    );
  });

  it("blocks retries after a conflict until the author explicitly reloads the revision", async () => {
    mocks.install.mockRejectedValueOnce(
      new GridoneError(409, "Driver revision changed"),
    );
    mount(<DriverEdit />);
    await waitFor(() => expect(submitButton()).toBeEnabled());
    const file = await selectFile();
    expect(
      screen.queryByRole("textbox", { name: "package.driverId" }),
    ).not.toBeInTheDocument();
    await userEvent.click(submitButton());
    expect(await screen.findByText("package.conflict")).toBeVisible();
    expect(submitButton()).toBeDisabled();
    fireEvent.submit(fileInput().closest("form")!);
    await waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(1));
    expect(mocks.presentation).toHaveBeenCalledTimes(1);
    expect((fileInput() as HTMLInputElement).files?.[0]).toBe(file);
    mocks.presentation.mockResolvedValue(status("revision-2"));
    await userEvent.click(
      screen.getByRole("button", { name: "package.reload" }),
    );
    await waitFor(() => expect(submitButton()).toBeEnabled());
    await userEvent.click(submitButton());
    await waitFor(() =>
      expect(mocks.install).toHaveBeenLastCalledWith("pump", expect.any(Blob), {
        expectedRevision: "revision-2",
      }),
    );
    expect(mocks.install).toHaveBeenCalledTimes(2);
  });

  it("keeps the conflict visible when reloading fails", async () => {
    mocks.install.mockRejectedValue(
      new GridoneError(409, "Driver revision changed"),
    );
    mount(<DriverEdit />);
    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.change(yamlInput(), { target: { value: "id: pump" } });
    await userEvent.click(submitButton());
    await screen.findByText("package.conflict");
    mocks.presentation.mockRejectedValue(new GridoneError(503, "Unavailable"));
    await userEvent.click(
      screen.getByRole("button", { name: "package.reload" }),
    );
    await waitFor(() => expect(mocks.presentation).toHaveBeenCalledTimes(2));
    expect(screen.getByText("package.conflict")).toBeVisible();
    expect(submitButton()).toBeDisabled();
  });

  it("allows a legacy driver without presentation to be replaced", async () => {
    mocks.presentation.mockResolvedValue(null);
    mount(<DriverEdit />);
    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.change(yamlInput(), { target: { value: "id: pump" } });
    await userEvent.click(submitButton());
    await waitFor(() =>
      expect(mocks.install).toHaveBeenCalledWith("pump", expect.any(Blob), {
        expectedRevision: undefined,
      }),
    );
  });
});

describe("package status and export", () => {
  it("shows unavailable presentation diagnostics even without source coordinates", async () => {
    mocks.presentation.mockResolvedValue({
      ...status(),
      diagnostics: [
        {
          code: "unsupported_version",
          path: "/schema_version",
          message: "Unsupported presentation schema version.",
        },
      ],
    });
    mount(<DriverPresentationStatus driverId="pump" />);
    expect(await screen.findByText("unsupported_version")).toBeVisible();
    expect(screen.getByText("/schema_version")).toBeVisible();
    expect(
      screen.getByText("Unsupported presentation schema version."),
    ).toBeVisible();
  });

  it.each([
    [null, "package.none"],
    [
      { status: "available", revision: "r1", document: {}, assets: {} },
      "package.available",
    ],
    [status(), "package.unavailable"],
  ])("renders presentation compatibility", async (presentation, label) => {
    mocks.presentation.mockResolvedValue(presentation);
    mount(<DriverPresentationStatus driverId="pump" />);
    expect(await screen.findByText(label)).toBeVisible();
  });

  it("keeps status errors local and offers to reload", async () => {
    mocks.presentation.mockRejectedValue(new GridoneError(404, "Not found"));
    mount(<DriverPresentationStatus driverId="pump" />);
    expect(await screen.findByText("package.statusFailed")).toBeVisible();
    mocks.presentation.mockResolvedValue(null);
    await userEvent.click(
      screen.getByRole("button", { name: "package.reload" }),
    );
    expect(await screen.findByText("package.none")).toBeVisible();
  });

  function Export() {
    const { exportPackage, exporting } = useExportDriverPackage("pump");
    return (
      <button onClick={exportPackage} disabled={exporting}>
        Export
      </button>
    );
  }
  it("downloads the complete server-provided ZIP unchanged", async () => {
    const blob = new Blob(["complete package"], { type: "application/zip" });
    mocks.export.mockResolvedValue(blob);
    mount(<Export />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith(blob, "pump.zip"),
    );
  });
  it("reports export failure without downloading an incomplete file", async () => {
    mocks.export.mockRejectedValue(new GridoneError(500, "Internal"));
    mount(<Export />);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith("package.exportFailed"),
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

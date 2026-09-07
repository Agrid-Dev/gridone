import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError } from "@gridone/sdk";
import type { Asset } from "@gridone/sdk";
import type { AppSchemaNode } from "@/lib/appConfigSchema";

const { mockClient, mockToast } = vi.hoisted(() => ({
  mockClient: {
    apps: {
      getConfigSchema: vi.fn(),
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
    },
  },
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => mockClient,
}));
vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const assets: Asset[] = [
  { id: "z1", type: "zone", name: "Zone 101", path: ["b1", "z1"], position: 0 },
  { id: "z2", type: "zone", name: "Zone 102", path: ["b1", "z2"], position: 1 },
  { id: "b1", type: "building", name: "Main", path: ["b1"], position: 0 },
];

vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: assets,
    assetsById: Object.fromEntries(assets.map((a) => [a.id, a])),
    isLoading: false,
  }),
}));

// Radix's Select/Popover/cmdk need pointer APIs jsdom lacks; render the
// primitives inline so the form's own logic is what the test drives.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
}));

import AppConfigForm from "./AppConfigForm";

/** The Copilote config schema, verbatim from the app contract spec. */
const copiloteSchema: AppSchemaNode = {
  type: "object",
  properties: {
    poll_interval_seconds: {
      type: "integer",
      minimum: 30,
      default: 60,
      title: "poll_interval.title",
    },
    piloted_zones: {
      type: "array",
      items: { type: "string", format: "asset-id" },
      default: [],
      title: "piloted_zones.title",
      description: "piloted_zones.description",
    },
  },
  required: ["piloted_zones"],
  i18n: {
    en: {
      "poll_interval.title": "Polling interval (seconds)",
      "piloted_zones.title": "Piloted zones",
      "piloted_zones.description": "Select the zones the app may control.",
    },
  },
};

/** The PMS config schema, verbatim from the app contract spec. */
const pmsSchema: AppSchemaNode = {
  type: "object",
  properties: {
    sync_interval_seconds: {
      type: "integer",
      minimum: 60,
      default: 600,
      title: "sync_interval.title",
    },
    provider: {
      type: "string",
      enum: ["apaleo", "mews"],
      title: "provider.title",
    },
  },
  required: ["provider"],
  oneOf: [
    {
      title: "Apaleo",
      properties: {
        provider: { const: "apaleo" },
        client_id: { type: "string", title: "Client ID" },
        client_secret: { type: "string", format: "password", title: "Secret" },
      },
      required: ["client_id", "client_secret"],
    },
    {
      title: "Mews",
      properties: {
        provider: { const: "mews" },
        access_token: { type: "string", format: "password", title: "Token" },
      },
      required: ["access_token"],
    },
  ],
  i18n: {
    en: {
      "sync_interval.title": "Sync interval (seconds)",
      "provider.title": "PMS provider",
    },
  },
};

function renderForm(
  props: Partial<React.ComponentProps<typeof AppConfigForm>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppConfigForm appId="app-1" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockClient.apps.updateConfig.mockResolvedValue({
    config: {},
    push_status: "ok",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppConfigForm — Copilote schema", () => {
  beforeEach(() => {
    mockClient.apps.getConfigSchema.mockResolvedValue(copiloteSchema);
    mockClient.apps.getConfig.mockResolvedValue({
      poll_interval_seconds: 90,
      piloted_zones: ["z1"],
    });
  });

  it("labels the fields through the schema's i18n catalog", async () => {
    renderForm();

    expect(
      await screen.findByText("Polling interval (seconds)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Piloted zones")).toBeInTheDocument();
    expect(
      screen.getByText("Select the zones the app may control."),
    ).toBeInTheDocument();
  });

  it("renders an asset multi-select for `items.format: asset-id`, seeded from the stored config", async () => {
    renderForm();

    expect(await screen.findByRole("combobox")).toHaveTextContent("Zone 101");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Zone 101Main",
      "Zone 102Main",
      "Main",
    ]);
  });

  it("submits the selected zones", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole("option", { name: /Zone 102/ }));
    await user.click(screen.getByRole("button", { name: /configSave/ }));

    await waitFor(() =>
      expect(mockClient.apps.updateConfig).toHaveBeenCalledWith("app-1", {
        poll_interval_seconds: 90,
        piloted_zones: ["z1", "z2"],
      }),
    );
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("falls back to the literal title when the catalog has no entry", async () => {
    mockClient.apps.getConfigSchema.mockResolvedValue({
      type: "object",
      properties: { region: { type: "string", title: "Region code" } },
      i18n: { en: { "other.title": "Unrelated" } },
    });
    mockClient.apps.getConfig.mockResolvedValue({});

    renderForm();

    expect(await screen.findByText("Region code")).toBeInTheDocument();
  });
});

describe("AppConfigForm — PMS schema", () => {
  beforeEach(() => {
    mockClient.apps.getConfigSchema.mockResolvedValue(pmsSchema);
    mockClient.apps.getConfig.mockResolvedValue({
      sync_interval_seconds: 600,
      provider: "apaleo",
      client_id: "id-1",
      client_secret: "secret-1",
    });
  });

  it("renders the stored branch's fields, masking the secrets", async () => {
    renderForm();

    expect(await screen.findByText("Client ID")).toBeInTheDocument();
    // Scope to inputs: the shared secret widget adds a reveal-toggle button
    // whose accessible name also matches /Secret/.
    expect(
      screen.getByLabelText(/Secret/, { selector: "input" }),
    ).toHaveAttribute("type", "password");
    expect(screen.queryByText("Token")).not.toBeInTheDocument();
  });

  it("swaps the branch fields when another provider is picked", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(await screen.findByLabelText("select"), "mews");

    expect(await screen.findByText("Token")).toBeInTheDocument();
    expect(screen.queryByText("Client ID")).not.toBeInTheDocument();
    // Root fields survive the swap.
    expect(screen.getByLabelText(/Sync interval/)).toHaveValue(600);
  });

  it("submits the new branch without the abandoned branch's secrets", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(await screen.findByLabelText("select"), "mews");
    await user.type(await screen.findByLabelText(/Token/), "tok-1");
    await user.click(screen.getByRole("button", { name: /configSave/ }));

    await waitFor(() =>
      expect(mockClient.apps.updateConfig).toHaveBeenCalledWith("app-1", {
        sync_interval_seconds: 600,
        provider: "mews",
        access_token: "tok-1",
      }),
    );
  });

  it("keeps the save disabled while a branch field is missing", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(await screen.findByLabelText("select"), "mews");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /configSave/ })).toBeDisabled(),
    );
  });

  it("surfaces the validation detail when the API answers 422", async () => {
    const user = userEvent.setup();
    mockClient.apps.updateConfig.mockRejectedValue(
      new GridoneError(422, "Config validation failed: client_id: too short"),
    );
    renderForm();

    await user.click(await screen.findByRole("button", { name: /configSave/ }));

    expect(
      await screen.findByText("Config validation failed: client_id: too short"),
    ).toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it("surfaces the crafted app-fault 503 message on save", async () => {
    // The app went down (or serves a broken schema) between load and save:
    // the backend's server-authored 503 body must reach the user instead of
    // the generic fallback — the app is at fault, not their input.
    const user = userEvent.setup();
    mockClient.apps.updateConfig.mockRejectedValue(
      new GridoneError(503, "App is unreachable"),
    );
    renderForm();

    await user.click(await screen.findByRole("button", { name: /configSave/ }));

    expect(await screen.findByText("App is unreachable")).toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it("attaches structured app-config errors to the offending field", async () => {
    const user = userEvent.setup();
    mockClient.apps.updateConfig.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["client_id"],
          msg: "Client ID is too short",
          type: "minLength",
        },
      ]),
    );
    renderForm();

    await user.click(await screen.findByRole("button", { name: /configSave/ }));

    expect(
      await screen.findByText("Client ID is too short"),
    ).toBeInTheDocument();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("attaches missing-required errors to their field (loc contract)", async () => {
    // The backend now rewrites jsonschema `required` errors from the parent
    // loc to the field itself (loc ["client_id"], type "missing") — the most
    // common validation failure must land under the input, not in the banner.
    const user = userEvent.setup();
    mockClient.apps.updateConfig.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["client_id"],
          msg: "'client_id' is a required property",
          type: "missing",
        },
      ]),
    );
    renderForm();

    await user.click(await screen.findByRole("button", { name: /configSave/ }));

    expect(
      await screen.findByText("'client_id' is a required property"),
    ).toBeInTheDocument();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("attaches indexed app-config errors to the rendered array field", async () => {
    const user = userEvent.setup();
    mockClient.apps.getConfigSchema.mockResolvedValue({
      type: "object",
      properties: {
        meters: {
          type: "array",
          title: "Meters",
          items: { type: "string" },
        },
      },
    });
    mockClient.apps.getConfig.mockResolvedValue({ meters: ["meter-1"] });
    mockClient.apps.updateConfig.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["meters", 0],
          msg: "Meter is unknown",
          type: "enum",
        },
      ]),
    );
    renderForm();

    await user.click(await screen.findByRole("button", { name: /configSave/ }));

    expect(await screen.findByText("Meter is unknown")).toBeInTheDocument();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("attaches indexed smart-meter errors to the right row field", async () => {
    const user = userEvent.setup();
    mockClient.apps.getConfigSchema.mockResolvedValue({
      type: "object",
      properties: {
        meters: {
          type: "array",
          title: "Meters",
          items: {
            type: "object",
            properties: {
              provider: { type: "string", enum: ["alpha", "beta"] },
              point_id: { type: "string", title: "Point ID" },
            },
            required: ["provider", "point_id"],
          },
        },
      },
    });
    mockClient.apps.getConfig.mockResolvedValue({
      meters: [{ provider: "alpha", point_id: "meter-1" }],
    });
    mockClient.apps.updateConfig.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["meters", 0, "point_id"],
          msg: "Point is unknown",
          type: "enum",
        },
      ]),
    );
    renderForm();

    const pointId = await screen.findByLabelText(/Point ID/);
    await user.click(screen.getByRole("button", { name: /configSave/ }));

    await waitFor(() =>
      expect(pointId.closest('[data-slot="field"]')).toHaveTextContent(
        "Point is unknown",
      ),
    );
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});

describe("AppConfigForm — registry widgets migration", () => {
  it("renders primitives through the schema-form registry (switch, multiline)", async () => {
    mockClient.apps.getConfigSchema.mockResolvedValue({
      type: "object",
      properties: {
        enabled: { type: "boolean", title: "Enabled", default: false },
        notes: { type: "string", multiline: true, title: "Notes" },
      },
    });
    mockClient.apps.getConfig.mockResolvedValue({});

    renderForm();

    expect(
      await screen.findByRole("switch", { name: "Enabled" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Notes").tagName).toBe("TEXTAREA");
  });
});

describe("AppConfigForm — degraded states", () => {
  it("tells the app is unreachable when the API answers 503", async () => {
    mockClient.apps.getConfigSchema.mockRejectedValue(
      new GridoneError(503, "App is unreachable"),
    );
    mockClient.apps.getConfig.mockResolvedValue({});

    renderForm();

    expect(await screen.findByText("config.unreachable")).toBeInTheDocument();
  });

  it("says there is no configuration when the app declares no properties", async () => {
    mockClient.apps.getConfigSchema.mockResolvedValue({ type: "object" });
    mockClient.apps.getConfig.mockResolvedValue({});

    renderForm();

    expect(await screen.findByText("noConfig")).toBeInTheDocument();
  });

  it("reports how the last save was delivered", async () => {
    mockClient.apps.getConfigSchema.mockResolvedValue(copiloteSchema);
    mockClient.apps.getConfig.mockResolvedValue({});

    renderForm({ pushStatus: "pending" });

    expect(
      await screen.findByText("config.pushStatus.pending"),
    ).toBeInTheDocument();
  });
});

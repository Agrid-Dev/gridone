import * as React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { CommandTemplate } from "@/api/commands";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "actions.commandActionForm.sourceLabel": "Command source",
    "actions.commandActionForm.useTemplate": "Use a saved template",
    "actions.commandActionForm.composeNew": "Define a new command",
    "actions.commandActionForm.edit": "Edit",
    "actions.commandActionForm.useCommand": "Use this command",
  }),
);

// Stub the shadcn Select with a native <select> for jsdom-friendly events.
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
      data-testid="source-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
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

vi.mock("@/api/commands", () => ({ getTemplate: vi.fn() }));
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: () => ({ devices: [], loading: false }),
}));
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({
    assetTree: [],
    assetsList: [],
    assetsById: {},
    isLoading: false,
  }),
}));
vi.mock("@/components/forms/resourcePickers/CommandTemplatePicker", () => ({
  default: ({ value }: { value?: string }) => (
    <div data-testid="picker">value={value ?? ""}</div>
  ),
}));
// Stand-in marker for the wizard so we can assert mode without booting its
// internals — the wizard itself has its own coverage.
vi.mock("@/pages/devices/commands/new/CommandWizard", () => ({
  CommandWizard: ({
    dispatchSubmit,
  }: {
    dispatchSubmit: { label: string };
  }) => <div data-testid="wizard">wizard:{dispatchSubmit.label}</div>,
}));

import { getTemplate } from "@/api/commands";
import { CommandActionForm } from "./CommandActionForm";

const mockedGetTemplate = vi.mocked(getTemplate);

const ephemeralTemplate: CommandTemplate = {
  id: "t-eph",
  name: null,
  target: { ids: ["d1"] },
  write: { attribute: "mode", value: "auto", dataType: "str" },
  createdAt: "2026-01-01T00:00:00Z",
  createdBy: "u1",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => mockedGetTemplate.mockReset());
afterEach(() => cleanup());

describe("CommandActionForm", () => {
  it("renders the source Select with both options and shows the picker by default", () => {
    render(<CommandActionForm onChange={() => {}} />, { wrapper });
    expect(screen.getByTestId("picker")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Use a saved template" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Define a new command" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
  });

  it("switches to the inline wizard when the user picks 'Define a new command'", () => {
    render(<CommandActionForm onChange={() => {}} />, { wrapper });
    fireEvent.change(screen.getByTestId("source-select"), {
      target: { value: "compose" },
    });
    expect(screen.getByTestId("wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("picker")).not.toBeInTheDocument();
  });

  it("auto-opens the inline wizard when the action references an ephemeral template", async () => {
    // The picker can't display ephemerals (filtered out of the saved list),
    // so the only way to edit one is the inline wizard. Auto-open spares
    // the user a dead-end "nothing selected" picker.
    mockedGetTemplate.mockResolvedValue(ephemeralTemplate);
    render(
      <CommandActionForm
        initialValue={{
          providerId: "command_template",
          params: { templateId: "t-eph" },
        }}
        onChange={() => {}}
      />,
      { wrapper },
    );

    await waitFor(() =>
      expect(screen.getByTestId("wizard")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("picker")).not.toBeInTheDocument();
  });
});

import { AttributeConfirmationProvider } from "@/contexts/AttributeConfirmationContext";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type Device, type GridoneClient } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { useDeviceControlRuntime } from "@/components/device-ui/runtime/useDeviceControlRuntime";
import { useDeviceDetails } from "@/hooks/useDeviceDetails";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
const api = {
  previewDeviceCommand: vi.fn(),
  sendCommand: vi.fn(),
  get: vi.fn(),
};
const device = {
  id: "a",
  name: "Room A",
  driver_id: "driver",
  transport_id: "transport",
  config: {},
  attributes: {
    setting: {
      name: "setting",
      data_type: "float",
      current_value: 20,
      read_write_modes: ["read", "write"],
      write_state: { status: "ready", constraints: { step: 1 } },
    },
  },
} as unknown as Device;
const controls = {
  setting: {
    kind: "number" as const,
    attribute: "setting",
    label: { default: "Setting" },
  },
};
function LiveEditor({ id }: { id: string }) {
  const runtime = useDeviceControlRuntime({ ...device, id }, controls);
  const state = runtime.readControl("setting")!;
  return (
    <>
      <button
        disabled={!state.writable}
        onClick={() =>
          runtime.activate({ control: "setting", op: "increment" })
        }
      >
        Increment
      </button>
      <output data-testid="value">{state.displayed}</output>
      <output data-testid="status">{state.write.kind}</output>
    </>
  );
}
function GenericEditor() {
  const editor = useDeviceDetails(device);
  return (
    <>
      <button onClick={() => editor.handleDraftChange("setting", 30)}>
        Edit
      </button>
      <button onClick={() => void editor.handleSave("setting")}>Save</button>
      <output data-testid="value">{editor.draft.setting}</output>
    </>
  );
}
function setup(generic = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  cache.setQueryData(["device", "a"], device);
  const renderTree = (id = "a") => (
    <QueryClientProvider client={cache}>
      <GridoneClientProvider
        client={{ devices: api } as unknown as GridoneClient}
      >
        <AttributeConfirmationProvider>
          {generic ? <GenericEditor /> : <LiveEditor id={id} />}
        </AttributeConfirmationProvider>
      </GridoneClientProvider>
    </QueryClientProvider>
  );
  return { ...render(renderTree()), renderTree };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  api.previewDeviceCommand.mockResolvedValue({
    device_id: "a",
    name: "Room A",
    eligible: true,
    current_value: 20,
    current_value_known: true,
    confirmation_token: "frozen-preview",
    user_confirmation: { default: "Communication may stop." },
  });
  api.sendCommand.mockResolvedValue({ id: 1 });
  api.get.mockResolvedValue(device);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function increment() {
  fireEvent.click(screen.getByText("Increment"));
}
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("confirms only the final debounced value, locks the control, and sends once", async () => {
  setup();
  await increment();
  await increment();
  await increment();
  await settle(599);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await settle(1);
  expect(screen.getByRole("dialog")).toHaveAccessibleName("confirmation.title");
  expect(screen.getByText("Communication may stop.")).toBeInTheDocument();
  expect(screen.getByText("Room A")).toBeInTheDocument();
  expect(screen.getByTestId("value")).toHaveTextContent("23");
  expect(screen.getByText("Increment")).toBeDisabled();
  expect(screen.getByTestId("status")).toHaveTextContent("idle");
  expect(api.sendCommand).not.toHaveBeenCalled();
  const confirm = screen.getByText("confirmation.confirm");
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  await settle();
  expect(api.sendCommand).toHaveBeenCalledExactlyOnceWith("a", {
    attribute: "setting",
    value: 23,
    confirm: true,
    ui_confirmation_token: "frozen-preview",
    confirmation_language: "en",
  });
});

it.each(["cancel", "escape", "close"])(
  "%s sends nothing and restores the reported value and focus",
  async (method) => {
    setup();
    const trigger = screen.getByText("Increment");
    trigger.focus();
    await increment();
    await settle(600);
    if (method === "cancel")
      fireEvent.click(screen.getByText("confirmation.cancel"));
    else if (method === "escape")
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(api.sendCommand).not.toHaveBeenCalled();
    expect(screen.getByTestId("value")).toHaveTextContent("20");
    await settle(1);
    expect(trigger).toHaveFocus();
  },
);

it("cancels pending consent when the target changes", async () => {
  const view = setup();
  await increment();
  await settle(600);
  view.rerender(view.renderTree("b"));
  await settle();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.sendCommand).not.toHaveBeenCalled();
});

it("uses the same confirmation for generic explicit-save edits", async () => {
  setup(true);
  fireEvent.click(screen.getByText("Edit"));
  fireEvent.click(screen.getByText("Save"));
  await settle();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(api.sendCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("confirmation.cancel"));
  await settle();
  expect(screen.getByTestId("value")).toHaveTextContent("20");
});

it("surfaces stale confirmation errors without retrying", async () => {
  api.sendCommand.mockRejectedValue(
    new GridoneError(409, { code: "command_preview_changed" }),
  );
  setup();
  await increment();
  await settle(600);
  fireEvent.click(screen.getByText("confirmation.confirm"));
  await settle();
  expect(screen.getByTestId("status")).toHaveTextContent("error");
  await settle(2000);
  expect(api.sendCommand).toHaveBeenCalledTimes(1);
});

it("keeps ordinary attributes on the existing immediate dispatch path", async () => {
  api.previewDeviceCommand.mockResolvedValue({ eligible: true });
  setup();
  await increment();
  await settle(600);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.sendCommand).toHaveBeenCalledExactlyOnceWith("a", {
    attribute: "setting",
    value: 21,
    confirm: true,
  });
});

it("requires explicit consent before a command with unknown operating rule state", async () => {
  api.previewDeviceCommand.mockResolvedValue({
    eligible: false,
    consent_required: true,
    confirmation_token: "unknown-preview",
    reasons: [{ code: "operating_rule_unknown" }],
  });
  setup();
  await increment();
  await settle(600);
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByText("confirmation.unknownOperatingRule")).toBeVisible();
  expect(api.sendCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("confirmation.confirm"));
  await settle();
  expect(api.sendCommand).toHaveBeenCalledExactlyOnceWith("a", {
    attribute: "setting",
    value: 21,
    confirm: true,
    ui_confirmation_token: "unknown-preview",
    confirmation_language: "en",
    acknowledge_unknown_operating_rules: true,
  });
});

it("does not offer consent for a known operating rule refusal", async () => {
  api.previewDeviceCommand.mockResolvedValue({
    eligible: false,
    consent_required: false,
    reasons: [{ code: "operating_rule_blocked" }],
  });
  setup();
  await increment();
  await settle(600);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.sendCommand).not.toHaveBeenCalled();
});

it("keeps ordinary controls enabled and queues clicks during a slow preview", async () => {
  let resolvePreview!: (preview: { eligible: boolean }) => void;
  api.previewDeviceCommand
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        }),
    )
    .mockResolvedValue({ eligible: true });
  setup();
  await increment();
  await settle(600);
  expect(screen.getByText("Increment")).toBeEnabled();
  await increment();
  await settle(600);
  expect(screen.getByTestId("value")).toHaveTextContent("22");
  await act(async () => resolvePreview({ eligible: true }));
  await settle();
  expect(api.sendCommand.mock.calls.map(([, body]) => body.value)).toEqual([
    21, 22,
  ]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("discards an older warning preview and reviews only the final debounced intention", async () => {
  let resolvePreview!: (preview: object) => void;
  api.previewDeviceCommand.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
  );
  setup();
  await increment();
  await settle(600);
  await increment();
  await act(async () =>
    resolvePreview({
      eligible: true,
      confirmation_token: "stale",
      user_confirmation: { default: "Old warning" },
    }),
  );
  await settle(599);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await settle(1);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByText("Old warning")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("confirmation.confirm"));
  await settle();
  expect(api.sendCommand).toHaveBeenCalledExactlyOnceWith(
    "a",
    expect.objectContaining({
      value: 22,
      ui_confirmation_token: "frozen-preview",
    }),
  );
});

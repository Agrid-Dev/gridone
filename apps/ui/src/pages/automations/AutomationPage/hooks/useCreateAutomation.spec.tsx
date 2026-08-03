import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type Trigger } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { ActionFormResult } from "../presenters/types";

const { mockCreate, mockToastError } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ automations: { create: mockCreate } }),
}));

import { useCreateAutomation } from "./useCreateAutomation";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    }
  >
    {children}
  </QueryClientProvider>
);

const TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "not-a-cron" },
} as Trigger;
const ACTION = {
  provider_id: "command",
  params: {},
} as unknown as ActionFormResult;

describe("useCreateAutomation — create-time server errors", () => {
  it("toasts a readable message for a 422, never the raw JSON blob", async () => {
    // The wizard is on the action step when create fires, so there is no
    // mounted trigger form to map fields onto — but the toast must still be
    // human-readable, not GridoneError.message's `HTTP 422: [{"loc":...}]`.
    mockCreate.mockRejectedValue(
      new GridoneError(422, [
        {
          loc: ["body", "trigger", "schedule", "params", "cron"],
          msg: "Value is not a valid cron expression",
          type: "value_error",
        },
      ]),
    );
    const { result } = renderHook(() => useCreateAutomation(), { wrapper });

    act(() =>
      result.current.submitMetadata({
        name: "Night setback",
        description: "",
        enabled: true,
      }),
    );
    act(() => result.current.submitTrigger(TRIGGER));
    act(() => result.current.submitAction(ACTION));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    const message = mockToastError.mock.calls[0][0] as string;
    expect(message).toBe(
      "toasts.saveError: cron: Value is not a valid cron expression",
    );
    expect(message).not.toContain("HTTP 422");
  });

  it("falls back to the generic message for a 500", async () => {
    mockCreate.mockRejectedValue(new GridoneError(500, "Traceback: ..."));
    const { result } = renderHook(() => useCreateAutomation(), { wrapper });

    act(() =>
      result.current.submitMetadata({
        name: "Night setback",
        description: "",
        enabled: true,
      }),
    );
    act(() => result.current.submitTrigger(TRIGGER));
    act(() => result.current.submitAction(ACTION));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("toasts.saveError"),
    );
  });
});

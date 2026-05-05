import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const {
  mockCreateAutomation,
  mockCreateTemplate,
  mockNavigate,
  mockToast,
  mockInvalidate,
} = vi.hoisted(() => ({
  mockCreateAutomation: vi.fn(),
  mockCreateTemplate: vi.fn(),
  mockNavigate: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockInvalidate: vi.fn(),
}));

vi.mock("@/api/automations", () => ({
  createAutomation: (...args: unknown[]) => mockCreateAutomation(...args),
}));

vi.mock("@/api/commands", () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
}));

// Drive useMutation synchronously off its mutationFn so the test doesn't need
// a real query client. Mirrors the AutomationPage spec's pattern.
vi.mock("@tanstack/react-query", () => ({
  useMutation: (opts: {
    mutationFn: (vars: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown) => void;
    onError?: (err: Error) => void;
  }) => ({
    mutate: async (vars: unknown) => {
      try {
        const data = await opts.mutationFn(vars);
        opts.onSuccess?.(data);
      } catch (err) {
        opts.onError?.(err as Error);
      }
    },
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

import { useCreateAutomation } from "./useCreateAutomation";

const META = { name: "Boost", description: "", enabled: true };
const TRIGGER = { providerId: "schedule", params: { cron: "0 6 * * *" } };
const INLINE_PAYLOAD = {
  target: { ids: ["d1"] },
  write: { attribute: "setpoint", value: 22, dataType: "float" as const },
};

beforeEach(() => {
  mockCreateAutomation.mockReset();
  mockCreateTemplate.mockReset();
  mockNavigate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
  mockInvalidate.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fillMetadataAndTrigger(
  hook: ReturnType<
    typeof renderHook<ReturnType<typeof useCreateAutomation>, void>
  >,
) {
  await act(async () => {
    hook.result.current.submitMetadata(META);
  });
  await act(async () => {
    hook.result.current.submitTrigger(TRIGGER);
  });
}

describe("useCreateAutomation chained submit", () => {
  it("uses an existing templateId without creating a new template", async () => {
    mockCreateAutomation.mockResolvedValue({ id: "auto-1" });
    const hook = renderHook(() => useCreateAutomation());
    await fillMetadataAndTrigger(hook);

    await act(async () => {
      hook.result.current.submitAction({
        kind: "templateId",
        templateId: "tpl-existing",
      });
    });

    expect(mockCreateTemplate).not.toHaveBeenCalled();
    expect(mockCreateAutomation).toHaveBeenCalledWith({
      name: "Boost",
      description: "",
      enabled: true,
      trigger: TRIGGER,
      action: {
        providerId: "command_template",
        params: { templateId: "tpl-existing" },
      },
    });
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/automations/auto-1"),
    );
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("creates an unnamed template first and uses its id for the automation", async () => {
    mockCreateTemplate.mockResolvedValue({ id: "tpl-new" });
    mockCreateAutomation.mockResolvedValue({ id: "auto-2" });
    const hook = renderHook(() => useCreateAutomation());
    await fillMetadataAndTrigger(hook);

    await act(async () => {
      hook.result.current.submitAction({
        kind: "inlineCommand",
        payload: INLINE_PAYLOAD,
      });
    });

    expect(mockCreateTemplate).toHaveBeenCalledTimes(1);
    expect(mockCreateTemplate).toHaveBeenCalledWith({
      ...INLINE_PAYLOAD,
      name: null,
    });
    expect(mockCreateAutomation).toHaveBeenCalledTimes(1);
    expect(mockCreateAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {
          providerId: "command_template",
          params: { templateId: "tpl-new" },
        },
      }),
    );
    expect(mockToast.success).toHaveBeenCalledTimes(1);
  });

  it("does not create the automation when the template save fails", async () => {
    mockCreateTemplate.mockRejectedValue(new Error("storage unreachable"));
    const hook = renderHook(() => useCreateAutomation());
    await fillMetadataAndTrigger(hook);

    await act(async () => {
      hook.result.current.submitAction({
        kind: "inlineCommand",
        payload: INLINE_PAYLOAD,
      });
    });

    expect(mockCreateTemplate).toHaveBeenCalledTimes(1);
    expect(mockCreateAutomation).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.error).toHaveBeenCalledWith("storage unreachable");
  });
});

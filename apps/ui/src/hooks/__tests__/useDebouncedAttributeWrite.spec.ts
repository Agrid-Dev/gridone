import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedAttributeWrite } from "../useDebouncedAttributeWrite";

// --- Mocks ---

const { mockUpdateDeviceAttribute, mockSetQueryData, mockToast } = vi.hoisted(
  () => ({
    mockUpdateDeviceAttribute: vi.fn(),
    mockSetQueryData: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
  }),
);

vi.mock("@/api/devices", () => ({
  updateDeviceAttribute: (...args: unknown[]) =>
    mockUpdateDeviceAttribute(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: mockSetQueryData }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("@/api/apiError", () => ({
  isApiError: (e: unknown) =>
    e instanceof Error && "details" in e && "status" in e,
}));

// --- Helpers ---

const DEVICE_ID = "dev-1";
const DELAY = 300;

function setup(onDraftChange = vi.fn()) {
  return renderHook(() =>
    useDebouncedAttributeWrite({
      deviceId: DEVICE_ID,
      onDraftChange,
      delay: DELAY,
    }),
  );
}

// --- Tests ---

describe("useDebouncedAttributeWrite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateDeviceAttribute.mockReset();
    mockSetQueryData.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockUpdateDeviceAttribute.mockResolvedValue({ id: DEVICE_ID });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onDraftChange immediately on changeAndSave", () => {
    const onDraftChange = vi.fn();
    const { result } = setup(onDraftChange);

    act(() => {
      result.current.changeAndSave("temperatureSetpoint", 22);
    });

    expect(onDraftChange).toHaveBeenCalledWith("temperatureSetpoint", 22);
    expect(mockUpdateDeviceAttribute).not.toHaveBeenCalled();
  });

  it("fires API call after debounce delay", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("temperatureSetpoint", 22);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockUpdateDeviceAttribute).toHaveBeenCalledOnce();
    expect(mockUpdateDeviceAttribute).toHaveBeenCalledWith(
      DEVICE_ID,
      "temperatureSetpoint",
      22,
    );
  });

  it("coalesces multiple rapid calls into a single API call", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("temperatureSetpoint", 21);
      result.current.changeAndSave("temperatureSetpoint", 21.5);
      result.current.changeAndSave("temperatureSetpoint", 22);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockUpdateDeviceAttribute).toHaveBeenCalledOnce();
    expect(mockUpdateDeviceAttribute).toHaveBeenCalledWith(
      DEVICE_ID,
      "temperatureSetpoint",
      22,
    );
  });

  it("changeAndSaveNow fires immediately without waiting", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoffState", true);
    });

    expect(mockUpdateDeviceAttribute).toHaveBeenCalledOnce();
    expect(mockUpdateDeviceAttribute).toHaveBeenCalledWith(
      DEVICE_ID,
      "onoffState",
      true,
    );
  });

  it("changeAndSaveNow cancels any pending debounced save for the same attribute", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("onoffState", false);
    });

    await act(async () => {
      result.current.changeAndSaveNow("onoffState", true);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    // Only the immediate save, not the debounced one
    expect(mockUpdateDeviceAttribute).toHaveBeenCalledOnce();
    expect(mockUpdateDeviceAttribute).toHaveBeenCalledWith(
      DEVICE_ID,
      "onoffState",
      true,
    );
  });

  it("allows concurrent saves on different attributes", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("temperatureSetpoint", 22);
    });

    await act(async () => {
      result.current.changeAndSaveNow("onoffState", true);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockUpdateDeviceAttribute).toHaveBeenCalledTimes(2);
  });

  it("isSaving reflects in-flight state", async () => {
    let resolveApi!: (v: unknown) => void;
    mockUpdateDeviceAttribute.mockReturnValue(
      new Promise((r) => {
        resolveApi = r;
      }),
    );

    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoffState", true);
    });

    expect(result.current.isSaving("onoffState")).toBe(true);
    expect(result.current.isSaving("temperatureSetpoint")).toBe(false);

    await act(async () => {
      resolveApi({ id: DEVICE_ID });
    });

    expect(result.current.isSaving("onoffState")).toBe(false);
  });

  it("updates query cache on success", async () => {
    const updated = { id: DEVICE_ID, attributes: {} };
    mockUpdateDeviceAttribute.mockResolvedValue(updated);
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoffState", true);
    });

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ["device", DEVICE_ID],
      updated,
    );
  });

  it("shows success toast on save", async () => {
    mockUpdateDeviceAttribute.mockResolvedValue({ id: DEVICE_ID });
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("temperatureSetpoint", 22);
    });

    expect(mockToast.success).toHaveBeenCalledOnce();
    expect(mockToast.success.mock.calls[0][0]).toContain("attributeUpdated");
    expect(mockToast.success.mock.calls[0][0]).toContain('"value":"22"');
  });

  it("shows error toast on API failure", async () => {
    mockUpdateDeviceAttribute.mockRejectedValue(new Error("Network error"));
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoffState", true);
    });

    expect(mockToast.error).toHaveBeenCalledWith("Network error");
  });

  it("cleans up timers on unmount", () => {
    const { result, unmount } = setup();

    act(() => {
      result.current.changeAndSave("temperatureSetpoint", 22);
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockUpdateDeviceAttribute).not.toHaveBeenCalled();
  });
});

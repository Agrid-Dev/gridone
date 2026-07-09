import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedAttributeWrite } from "../useDebouncedAttributeWrite";

// --- Mocks ---

const { mockSendCommand, mockGetDevice, mockSetQueryData, mockToast } =
  vi.hoisted(() => ({
    mockSendCommand: vi.fn(),
    mockGetDevice: vi.fn(),
    mockSetQueryData: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
  }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      sendCommand: (...args: unknown[]) => mockSendCommand(...args),
      get: (...args: unknown[]) => mockGetDevice(...args),
    },
  }),
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
    mockSendCommand.mockReset();
    mockGetDevice.mockReset();
    mockSetQueryData.mockReset();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockSendCommand.mockResolvedValue({ status: "success" });
    mockGetDevice.mockResolvedValue({ id: DEVICE_ID });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onDraftChange immediately on changeAndSave", () => {
    const onDraftChange = vi.fn();
    const { result } = setup(onDraftChange);

    act(() => {
      result.current.changeAndSave("temperature_setpoint", 22);
    });

    expect(onDraftChange).toHaveBeenCalledWith("temperature_setpoint", 22);
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it("fires API call after debounce delay", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("temperature_setpoint", 22);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockSendCommand).toHaveBeenCalledOnce();
    expect(mockSendCommand).toHaveBeenCalledWith(DEVICE_ID, {
      attribute: "temperature_setpoint",
      value: 22,
    });
  });

  it("coalesces multiple rapid calls into a single API call", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("temperature_setpoint", 21);
      result.current.changeAndSave("temperature_setpoint", 21.5);
      result.current.changeAndSave("temperature_setpoint", 22);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockSendCommand).toHaveBeenCalledOnce();
    expect(mockSendCommand).toHaveBeenCalledWith(DEVICE_ID, {
      attribute: "temperature_setpoint",
      value: 22,
    });
  });

  it("changeAndSaveNow fires immediately without waiting", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoff_state", true);
    });

    expect(mockSendCommand).toHaveBeenCalledOnce();
    expect(mockSendCommand).toHaveBeenCalledWith(DEVICE_ID, {
      attribute: "onoff_state",
      value: true,
    });
  });

  it("changeAndSaveNow cancels any pending debounced save for the same attribute", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("onoff_state", false);
    });

    await act(async () => {
      result.current.changeAndSaveNow("onoff_state", true);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    // Only the immediate save, not the debounced one
    expect(mockSendCommand).toHaveBeenCalledOnce();
    expect(mockSendCommand).toHaveBeenCalledWith(DEVICE_ID, {
      attribute: "onoff_state",
      value: true,
    });
  });

  it("allows concurrent saves on different attributes", async () => {
    const { result } = setup();

    act(() => {
      result.current.changeAndSave("temperature_setpoint", 22);
    });

    await act(async () => {
      result.current.changeAndSaveNow("onoff_state", true);
    });

    await act(async () => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockSendCommand).toHaveBeenCalledTimes(2);
  });

  it("isSaving reflects in-flight state", async () => {
    let resolveApi!: (v: unknown) => void;
    mockSendCommand.mockReturnValue(
      new Promise((r) => {
        resolveApi = r;
      }),
    );

    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoff_state", true);
    });

    expect(result.current.isSaving("onoff_state")).toBe(true);
    expect(result.current.isSaving("temperature_setpoint")).toBe(false);

    await act(async () => {
      resolveApi({ status: "success" });
    });

    expect(result.current.isSaving("onoff_state")).toBe(false);
  });

  it("updates query cache with the refetched device on success", async () => {
    const updated = { id: DEVICE_ID, attributes: {} };
    mockGetDevice.mockResolvedValue(updated);
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoff_state", true);
    });

    expect(mockGetDevice).toHaveBeenCalledWith(DEVICE_ID);
    expect(mockSetQueryData).toHaveBeenCalledWith(
      ["device", DEVICE_ID],
      updated,
    );
  });

  it("shows success toast on save", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("temperature_setpoint", 22);
    });

    expect(mockToast.success).toHaveBeenCalledOnce();
    expect(mockToast.success.mock.calls[0][0]).toContain("attributeUpdated");
    expect(mockToast.success.mock.calls[0][0]).toContain('"value":"22"');
  });

  it("shows error toast on API failure", async () => {
    mockSendCommand.mockRejectedValue(new Error("Network error"));
    const { result } = setup();

    await act(async () => {
      result.current.changeAndSaveNow("onoff_state", true);
    });

    expect(mockToast.error).toHaveBeenCalledWith("Network error");
  });

  it("cleans up timers on unmount", () => {
    const { result, unmount } = setup();

    act(() => {
      result.current.changeAndSave("temperature_setpoint", 22);
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(DELAY);
    });

    expect(mockSendCommand).not.toHaveBeenCalled();
  });
});

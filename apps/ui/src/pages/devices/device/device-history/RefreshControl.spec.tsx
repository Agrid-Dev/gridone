import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createI18nMock } from "@/test/i18nMock";

const { mockSetRefreshInterval, mockRefreshNow, contextValue } = vi.hoisted(
  () => ({
    mockSetRefreshInterval: vi.fn(),
    mockRefreshNow: vi.fn(),
    contextValue: {
      refreshInterval: 0,
      isRefreshing: false,
    },
  }),
);

vi.mock("./DeviceHistoryContext", () => ({
  useDeviceHistoryContext: () => ({
    refreshInterval: contextValue.refreshInterval,
    isRefreshing: contextValue.isRefreshing,
    setRefreshInterval: mockSetRefreshInterval,
    refreshNow: mockRefreshNow,
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "history.refresh.now": "Refresh now",
    "history.refresh.auto": "Auto-refresh",
    "history.refresh.off": "Auto off",
    "history.refresh.10s": "10 s",
    "history.refresh.1m": "1 min",
    "history.refresh.5m": "5 min",
  }),
);

// Imports below this line must come after the vi.mock calls.
import { RefreshControl } from "./RefreshControl";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  contextValue.refreshInterval = 0;
  contextValue.isRefreshing = false;
});

describe("RefreshControl", () => {
  it("fires an immediate refresh", async () => {
    const user = userEvent.setup();
    render(<RefreshControl />);

    await user.click(screen.getByRole("button", { name: "Refresh now" }));
    expect(mockRefreshNow).toHaveBeenCalledOnce();
  });

  it("changes the auto-refresh cadence from the picker", async () => {
    const user = userEvent.setup();
    render(<RefreshControl />);

    await user.click(screen.getByRole("button", { name: "Auto-refresh" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "10 s" }),
    );
    expect(mockSetRefreshInterval).toHaveBeenCalledWith(10_000);
  });

  it("shows the active cadence on the trigger", () => {
    contextValue.refreshInterval = 60_000;
    render(<RefreshControl />);

    expect(
      screen.getByRole("button", { name: "Auto-refresh" }),
    ).toHaveTextContent("1 min");
  });
});

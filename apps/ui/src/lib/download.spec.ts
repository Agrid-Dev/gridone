import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openBlankTab, showBlob } from "./download";

describe("showing a file in a new tab", () => {
  const created: Blob[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:file";
    });
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    created.length = 0;
  });

  it("opens the tab without a way back to the page", () => {
    const tab = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(tab);
    expect(openBlankTab()).toBe(tab);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
  });

  it("shows the file as the given type and frees it only once the tab is closed", () => {
    const tab = { closed: false, location: { href: "" } };
    showBlob(
      tab as unknown as Window,
      new Blob(["notice"]),
      "text/plain;charset=utf-8",
      "notice.txt",
    );
    expect(tab.location.href).toBe("blob:file");
    expect(created[0]?.type).toBe("text/plain;charset=utf-8");
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    tab.closed = true;
    vi.advanceTimersByTime(5_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:file");
  });

  it("downloads the file when the browser refused the tab", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    showBlob(null, new Blob(["notice"]), "application/pdf", "notice.pdf");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("leaves alone a tab closed before the file arrived", () => {
    const tab = { closed: true, location: { href: "" } };
    showBlob(tab as unknown as Window, new Blob([""]), "image/png", "a.png");
    expect(tab.location.href).toBe("");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("frees the file once, then stops watching the closed tab", () => {
    const tab = { closed: false, location: { href: "" } };
    showBlob(
      tab as unknown as Window,
      new Blob(["notice"]),
      "application/pdf",
      "notice.pdf",
    );
    tab.closed = true;
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a tab the browser refused as null", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(openBlankTab()).toBeNull();
  });
});

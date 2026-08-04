import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useCommandHotkey } from "../useCommandHotkey";

function Probe({ onTrigger }: { onTrigger: () => void }) {
  useCommandHotkey(onTrigger);
  return <input aria-label="field" />;
}

type PressInit = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
};

function press(target: Element | Document, init: PressInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useCommandHotkey", () => {
  afterEach(() => cleanup());

  it("fires on Meta+K", () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);
    press(document, { key: "k", metaKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("fires on Ctrl+K", () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);
    press(document, { key: "k", ctrlKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  // The deliberate divergence from useFocusHotkey: a global palette chord must
  // stay reachable while the user is typing.
  it("fires even when focus is inside an input", () => {
    const onTrigger = vi.fn();
    const { getByLabelText } = render(<Probe onTrigger={onTrigger} />);
    const field = getByLabelText("field") as HTMLInputElement;
    field.focus();
    press(field, { key: "k", metaKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("is case-insensitive on the key", () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);
    press(document, { key: "K", metaKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("ignores a bare k with no modifier", () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);
    press(document, { key: "k" });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("ignores the chord when Alt is also held", () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);
    press(document, { key: "k", metaKey: true, altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("ignores auto-repeat while the chord is held", () => {
    const onTrigger = vi.fn();
    render(<Probe onTrigger={onTrigger} />);
    press(document, { key: "k", metaKey: true, repeat: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("prevents the browser default", () => {
    render(<Probe onTrigger={vi.fn()} />);
    const event = press(document, { key: "k", metaKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it("removes the listener on unmount", () => {
    const onTrigger = vi.fn();
    const { unmount } = render(<Probe onTrigger={onTrigger} />);
    unmount();
    press(document, { key: "k", metaKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("calls the latest callback without re-subscribing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe onTrigger={first} />);
    rerender(<Probe onTrigger={second} />);
    press(document, { key: "k", metaKey: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

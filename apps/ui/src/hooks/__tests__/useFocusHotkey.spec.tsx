import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useRef } from "react";
import { useFocusHotkey } from "../useFocusHotkey";

function Probe({ hotkey = "/" }: { hotkey?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useFocusHotkey(hotkey, ref);
  return (
    <>
      <input ref={ref} aria-label="target" />
      <input aria-label="other" />
      <button aria-label="trigger">click</button>
      <div aria-label="editable" contentEditable tabIndex={0} />
    </>
  );
}

function press(target: Element | Document, key: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

describe("useFocusHotkey", () => {
  beforeEach(() => {
    document.body.focus();
  });
  afterEach(() => cleanup());

  it("focuses the referenced element when the key is pressed at document level", () => {
    const { getByLabelText } = render(<Probe />);
    const button = getByLabelText("trigger") as HTMLButtonElement;
    button.focus();
    press(button, "/");
    expect(document.activeElement).toBe(getByLabelText("target"));
  });

  it("does not steal keystrokes when focus is in another input", () => {
    const { getByLabelText } = render(<Probe />);
    const other = getByLabelText("other") as HTMLInputElement;
    other.focus();
    press(other, "/");
    expect(document.activeElement).toBe(other);
  });

  it("does not steal keystrokes inside a contenteditable region", () => {
    const { getByLabelText } = render(<Probe />);
    const editable = getByLabelText("editable") as HTMLDivElement;
    editable.focus();
    press(editable, "/");
    expect(document.activeElement).toBe(editable);
  });

  it("ignores the shortcut when a modifier is held", () => {
    const { getByLabelText } = render(<Probe />);
    const button = getByLabelText("trigger") as HTMLButtonElement;
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(button);
  });
});

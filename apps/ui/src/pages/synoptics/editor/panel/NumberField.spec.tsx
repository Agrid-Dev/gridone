import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumberField } from "./NumberField";

afterEach(cleanup);

/** The field over a stored number, as the panel holds one: what it commits
 *  becomes the value it is given back. */
function Stored({
  initial,
  min,
  max,
  onCommit,
}: {
  initial: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      aria-label="Cell"
      value={value}
      min={min}
      max={max}
      onCommit={(next) => {
        onCommit(next);
        setValue(next);
      }}
    />
  );
}

const field = () => screen.getByRole("spinbutton", { name: "Cell" });
const type = (text: string) =>
  fireEvent.change(field(), { target: { value: text } });

describe("NumberField", () => {
  it("holds what is typed until the field is left, then commits it once", () => {
    const onCommit = vi.fn();
    render(<Stored initial={3} onCommit={onCommit} />);
    // "1" on the way to "12" is never a value of the document.
    type("1");
    type("12");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(12);
  });

  it("commits on Enter, and the blur that follows commits nothing more", () => {
    const onCommit = vi.fn();
    render(<Stored initial={3} onCommit={onCommit} />);
    type("7");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(7);
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("clamps what is typed to its bounds, and shows the number kept", () => {
    const onCommit = vi.fn();
    render(<Stored initial={5} min={2} max={9} onCommit={onCommit} />);
    type("1");
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenLastCalledWith(2);
    expect(field()).toHaveValue(2);
    type("40");
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenLastCalledWith(9);
    expect(field()).toHaveValue(9);
  });

  it("keeps a whole number of what is typed", () => {
    const onCommit = vi.fn();
    render(<Stored initial={5} onCommit={onCommit} />);
    type("7.8");
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("gives the stored value back on Escape, and commits nothing after it", () => {
    const onCommit = vi.fn();
    render(<Stored initial={5} onCommit={onCommit} />);
    type("8");
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field()).toHaveValue(5);
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("gives the stored value back for an emptied entry, without committing", () => {
    const onCommit = vi.fn();
    render(<Stored initial={5} min={2} onCommit={onCommit} />);
    type("");
    fireEvent.blur(field());
    // Mutant: reading "" as 0 (then the minimum) moves a port the author
    // only meant to retype.
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveValue(5);
  });

  it("does not clear an optional number when an empty draft is cancelled", () => {
    const onClear = vi.fn();
    const onCommit = vi.fn();
    render(
      <NumberField
        aria-label="Cell"
        value={5}
        onCommit={onCommit}
        onClear={onClear}
      />,
    );
    type("");
    fireEvent.keyDown(field(), { key: "Escape" });
    fireEvent.blur(field());
    expect(field()).toHaveValue(5);
    expect(onClear).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not clear an optional number for an incomplete numeric entry", () => {
    const onClear = vi.fn();
    const onCommit = vi.fn();
    render(
      <NumberField
        aria-label="Cell"
        value={5}
        onCommit={onCommit}
        onClear={onClear}
      />,
    );
    type("");
    // Native number inputs expose e.g. "1e" as "" with badInput set.
    Object.defineProperty(field(), "validity", { value: { badInput: true } });
    fireEvent.blur(field());
    expect(field()).toHaveValue(5);
    expect(onClear).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not clear an optional number that is already unset", () => {
    const onClear = vi.fn();
    const onCommit = vi.fn();
    render(
      <NumberField
        aria-label="Cell"
        value={null}
        onCommit={onCommit}
        onClear={onClear}
      />,
    );
    type("2");
    type("");
    fireEvent.blur(field());
    expect(field()).toHaveValue(null);
    expect(onClear).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits nothing when the number kept is the one stored", () => {
    const onCommit = vi.fn();
    render(<Stored initial={5} max={5} onCommit={onCommit} />);
    type("12");
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
    expect(field()).toHaveValue(5);
  });

  it("shows a stored value changed from elsewhere (an undo)", () => {
    const onCommit = vi.fn();
    const { rerender } = render(
      <NumberField aria-label="Cell" value={4} onCommit={onCommit} />,
    );
    rerender(<NumberField aria-label="Cell" value={6} onCommit={onCommit} />);
    expect(field()).toHaveValue(6);
  });
});

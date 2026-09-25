import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { createI18nMock } from "@/test/i18nMock";
import { PreviewCard } from "./PreviewCard";

const { drawn } = vi.hoisted(() => ({
  drawn: [] as { projection: string | undefined; animated?: boolean }[],
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "editor.preview.title": "3D preview",
    "editor.preview.expand": "Enlarge the preview",
    "editor.preview.close": "Hide the preview",
  }),
);
// What the card hands the renderer is the point here; the drawing itself
// is the renderer's spec.
vi.mock("@/components/synoptic/SynopticRenderer", () => ({
  SynopticRenderer: ({
    doc,
    animated,
  }: {
    doc: PlateDocument;
    animated?: boolean;
  }) => {
    drawn.push({ projection: doc.projection, animated });
    return <svg data-testid="plate" />;
  },
}));

afterEach(() => {
  cleanup();
  drawn.length = 0;
});

const PLAN: PlateDocument = {
  version: 1,
  name: "ECS Ouest",
  description: null,
  projection: "flat",
  symbols: [],
  pipes: [],
  labels: [],
};

describe("PreviewCard", () => {
  it("draws the plate isometric, whatever view it opens on, and still", () => {
    render(<PreviewCard doc={PLAN} onExpand={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("plate")).toBeInTheDocument();
    // Mutant: the plate's own view draws the plan the author is already
    // looking at.
    expect(drawn.at(-1)).toEqual({ projection: "isometric", animated: false });
  });

  it("enlarges and hides on its two buttons", () => {
    const onExpand = vi.fn();
    const onClose = vi.fn();
    render(<PreviewCard doc={PLAN} onExpand={onExpand} onClose={onClose} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Enlarge the preview" }),
    );
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hide the preview" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

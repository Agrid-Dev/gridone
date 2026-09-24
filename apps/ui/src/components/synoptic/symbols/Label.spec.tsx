import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { textWidth } from "../text";
import { faceLabelBox, Label } from "./Label";

afterEach(cleanup);

/** Each line a face caption draws, as a box read off its tspans: 11 px
 *  high above its baseline, as wide as the plate estimates the line. */
function drawnLines(text: string, at: { x: number; y: number }) {
  const { container } = render(
    <svg>
      <Label text={text} at={at} lift={0} onFace />
    </svg>,
  );
  const t = container.querySelector("text")!;
  let y = Number(t.getAttribute("y"));
  return [...t.querySelectorAll("tspan")].map((span, i) => {
    if (i > 0) y += Number(span.getAttribute("dy"));
    const x = Number(span.getAttribute("x"));
    const w = textWidth(span.textContent ?? "", 11);
    return { x0: x - w / 2, y0: y - 11, x1: x + w / 2, y1: y };
  });
}

describe("faceLabelBox", () => {
  it.each([
    ["LINK", { x: 0, y: 0 }],
    ["EAU FROIDE", { x: 100, y: 40 }],
    ["EAU FROIDE ADOUCIE", { x: 1000, y: -28 }],
    ["DISTRIBUTION ECS", { x: -12.5, y: 7.25 }],
    ["A B C D E", { x: 3, y: 3 }],
  ])(
    "is the box the caption %s draws on the face, one line a word",
    (text, at) => {
      const lines = drawnLines(text, at);
      expect(lines).toHaveLength(text.split(" ").length);
      const box = faceLabelBox(text, at);
      // Every line inside it, and it no bigger than they are together.
      for (const line of lines) {
        expect(line.x0).toBeGreaterThanOrEqual(box.x0 - 1e-9);
        expect(line.x1).toBeLessThanOrEqual(box.x1 + 1e-9);
        expect(line.y0).toBeGreaterThanOrEqual(box.y0 - 1e-9);
        expect(line.y1).toBeLessThanOrEqual(box.y1 + 1e-9);
      }
      expect(box.x0).toBeCloseTo(Math.min(...lines.map((l) => l.x0)), 9);
      expect(box.x1).toBeCloseTo(Math.max(...lines.map((l) => l.x1)), 9);
      expect(box.y0).toBeCloseTo(Math.min(...lines.map((l) => l.y0)), 9);
      expect(box.y1).toBeCloseTo(Math.max(...lines.map((l) => l.y1)), 9);
      // Centred on its point across; the lines stay centred on it down.
      expect((box.x0 + box.x1) / 2).toBeCloseTo(at.x, 9);
    },
  );
});

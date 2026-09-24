import { describe, expect, it } from "vitest";
import {
  declutter,
  scaleAbout,
  TEXT_RANK,
  textScale,
  type TextFootprint,
} from "./legibility";
import type { Box } from "./placement";

/** A deterministic stream of numbers in [0, 1): the sweeps below walk the
 *  same layouts on every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Strict overlap: sharing an edge is not overlapping. Written here, apart
 *  from the module, so the tests do not borrow its definition. */
const overlapping = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const inside = (b: Box, frame: Box) =>
  b.x0 >= frame.x0 && b.y0 >= frame.y0 && b.x1 <= frame.x1 && b.y1 <= frame.y1;

/** `box` grown `k` times about `anchor`, computed independently of
 *  `scaleAbout`. */
const grownAbout = (box: Box, anchor: { x: number; y: number }, k: number) => {
  const xs = [box.x0, box.x1].map((x) => anchor.x + (x - anchor.x) * k);
  const ys = [box.y0, box.y1].map((y) => anchor.y + (y - anchor.y) * k);
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
};

const text = (
  box: Box,
  anchor: { x: number; y: number },
  rank: number,
): TextFootprint => ({ box, anchor, rank });

describe("textScale", () => {
  it("is 1 with no floor, before layout, or when the text already reads at the floor", () => {
    expect(textScale(undefined, 11, 0.1)).toBe(1);
    expect(textScale(0, 11, 0.1)).toBe(1);
    expect(textScale(11, 11, 0)).toBe(1);
    expect(textScale(11, 11, -1)).toBe(1);
    expect(textScale(11, 11, Number.NaN)).toBe(1);
    expect(textScale(11, 11, 1)).toBe(1);
    expect(textScale(11, 11, 3)).toBe(1);
    expect(textScale(9, 11, 1)).toBe(1);
  });

  it("holds the text exactly at the floor on a step, and rounds up between steps", () => {
    // Half a pixel per unit: 11 px text shows 5.5 px, held twice as large.
    expect(textScale(11, 11, 0.5)).toBe(2);
    expect(textScale(22, 11, 0.5)).toBe(4);
    // 12 / 11 = 1.0909 lies just above the first step (2^(1/8) = 1.0905):
    // the next step up, never the one below.
    expect(textScale(12, 11, 1)).toBeCloseTo(2 ** (2 / 8), 12);
    // 11 / (11 · 0.95) = 1.0526: the first step.
    expect(textScale(11, 11, 0.95)).toBeCloseTo(2 ** (1 / 8), 12);
  });

  it("is never below 1, never shows the text under the floor, moves in eighths of a doubling and overshoots by less than a step", () => {
    const floors = [4, 8, 9, 11, 12, 14, 16, 20, 31];
    const bases = [6, 11, 18];
    const scales = [
      0.01, 0.05, 0.1, 0.13, 0.2, 0.25, 0.33, 0.4, 0.5, 0.61, 0.7, 0.75, 0.8,
      0.9, 0.95, 0.99, 1, 1.01, 1.1, 1.3, 1.7, 2, 2.9, 4, 8,
    ];
    let held = 0;
    for (const minPx of floors) {
      for (const basePx of bases) {
        let previous = Number.POSITIVE_INFINITY;
        for (const pxPerUnit of scales) {
          const k = textScale(minPx, basePx, pxPerUnit);
          expect(k).toBeGreaterThanOrEqual(1);
          const shown = k * basePx * pxPerUnit;
          if (k > 1) {
            held += 1;
            // At the floor or above it, with float noise forgiven.
            expect(shown).toBeGreaterThanOrEqual(minPx * (1 - 1e-12));
            // One step lower would have shown it under the floor.
            expect(shown / 2 ** (1 / 8)).toBeLessThan(minPx);
            // A whole number of eighths of a doubling.
            const eighths = Math.log2(k) * 8;
            expect(Math.abs(eighths - Math.round(eighths))).toBeLessThan(1e-9);
          } else {
            expect(basePx * pxPerUnit).toBeGreaterThanOrEqual(minPx);
          }
          // Zooming in never holds the text larger.
          expect(k).toBeLessThanOrEqual(previous);
          previous = k;
        }
      }
    }
    // The sweep did exercise the held branch, many times over.
    expect(held).toBeGreaterThan(100);
  });

  it("never holds text smaller for a higher floor", () => {
    const floors = [4, 6, 8, 9, 10, 11, 12, 13, 16, 20, 24];
    for (const pxPerUnit of [0.05, 0.3, 0.5, 0.77, 1, 1.4]) {
      const ks = floors.map((minPx) => textScale(minPx, 11, pxPerUnit));
      ks.slice(1).forEach((k, i) => expect(k).toBeGreaterThanOrEqual(ks[i]));
    }
  });
});

describe("scaleAbout", () => {
  it("keeps the anchor put and moves every edge k times further from it", () => {
    const box = { x0: 10, y0: 20, x1: 40, y1: 30 };
    expect(scaleAbout(box, { x: 10, y: 30 }, 2)).toEqual({
      x0: 10,
      y0: 10,
      x1: 70,
      y1: 30,
    });
    expect(scaleAbout(box, { x: 0, y: 0 }, 3)).toEqual({
      x0: 30,
      y0: 60,
      x1: 120,
      y1: 90,
    });
    expect(scaleAbout(box, { x: 25, y: 25 }, 1)).toEqual(box);
    // An anchor outside the box: the box moves away from it.
    expect(scaleAbout(box, { x: 25, y: 50 }, 2)).toEqual({
      x0: -5,
      y0: -10,
      x1: 55,
      y1: 10,
    });
  });
});

describe("declutter", () => {
  const A = { x0: 0, y0: 0, x1: 40, y1: 10 };
  const B = { x0: 20, y0: 5, x1: 60, y1: 15 };

  it("hides nothing while the text reads at its own size, even where boxes overlap", () => {
    const items = [
      { id: "a", text: text(A, { x: 0, y: 10 }, TEXT_RANK.note) },
      { id: "b", text: text(B, { x: 20, y: 15 }, TEXT_RANK.note) },
    ];
    expect(overlapping(A, B)).toBe(true);
    expect(declutter(items, 1).size).toBe(0);
    expect(declutter(items, 0.5).size).toBe(0);
    // Not even what lies past the frame.
    expect(declutter(items, 1, { x0: 0, y0: 0, x1: 1, y1: 1 }).size).toBe(0);
  });

  it("never hides an item that carries no text", () => {
    const items = [
      { id: "body" },
      { id: "a", text: text(A, { x: 0, y: 10 }, TEXT_RANK.name) },
      { id: "run" },
    ];
    expect(declutter(items, 4, { x0: 0, y0: 0, x1: 1, y1: 1 })).toEqual(
      new Set(["a"]),
    );
  });

  it("keeps the lower rank whatever the order the items come in", () => {
    const note = { id: "note", text: text(A, { x: 0, y: 10 }, TEXT_RANK.note) };
    const name = {
      id: "name",
      text: text(B, { x: 20, y: 15 }, TEXT_RANK.name),
    };
    expect(declutter([note, name], 2)).toEqual(new Set(["note"]));
    expect(declutter([name, note], 2)).toEqual(new Set(["note"]));
    // A device in fault keeps its name over a healthy one's.
    const alarm = {
      id: "alarm",
      text: text(A, { x: 0, y: 10 }, TEXT_RANK.alarm),
    };
    const healthy = {
      id: "healthy",
      text: text(B, { x: 20, y: 15 }, TEXT_RANK.name),
    };
    expect(declutter([healthy, alarm], 2)).toEqual(new Set(["healthy"]));
  });

  it("orders the ranks as documented: alarm, name, reading, tag, note", () => {
    expect(
      [
        TEXT_RANK.alarm,
        TEXT_RANK.name,
        TEXT_RANK.reading,
        TEXT_RANK.tag,
        TEXT_RANK.note,
      ].every((r, i, all) => i === 0 || all[i - 1] < r),
    ).toBe(true);
  });

  it("keeps the first of two equal ranks", () => {
    const first = {
      id: "first",
      text: text(A, { x: 0, y: 10 }, TEXT_RANK.tag),
    };
    const second = {
      id: "second",
      text: text(B, { x: 20, y: 15 }, TEXT_RANK.tag),
    };
    expect(declutter([first, second], 2)).toEqual(new Set(["second"]));
    expect(declutter([second, first], 2)).toEqual(new Set(["first"]));
  });

  it("keeps two texts that only touch once grown", () => {
    // Stacked: the upper grows up from its bottom edge, the lower down from
    // its top edge, so at any k they share the line y = 10 and no more.
    const upper = {
      id: "upper",
      text: text({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x: 5, y: 10 }, 1),
    };
    const lower = {
      id: "lower",
      text: text({ x0: 0, y0: 10, x1: 10, y1: 20 }, { x: 5, y: 10 }, 1),
    };
    for (const k of [1.25, 2, 3]) {
      expect(declutter([upper, lower], k).size).toBe(0);
    }
  });

  it("takes each text a little wider than measured, since the width is an estimate", () => {
    // Side by side, each growing away from the other: 6.9 px apart at the
    // first step, which the estimated width's error (a tenth of the width
    // per side, scaled) more than closes.
    const k = 2 ** (1 / 8);
    const left = {
      id: "left",
      text: text({ x0: 0, y0: 0, x1: 100, y1: 10 }, { x: 0, y: 5 }, 1),
    };
    const right = {
      id: "right",
      text: text({ x0: 125, y0: 0, x1: 225, y1: 10 }, { x: 225, y: 5 }, 1),
    };
    const drawnLeft = grownAbout(left.text.box, left.text.anchor, k);
    const drawnRight = grownAbout(right.text.box, right.text.anchor, k);
    expect(drawnRight.x0 - drawnLeft.x1).toBeGreaterThan(6);
    expect(declutter([left, right], k)).toEqual(new Set(["right"]));
    // Far enough apart, both stay.
    const far = {
      id: "far",
      text: text({ x0: 160, y0: 0, x1: 260, y1: 10 }, { x: 260, y: 5 }, 1),
    };
    expect(declutter([left, far], k).size).toBe(0);
  });

  it("widens only across: a reading hanging under its name, grown about the same point, stays", () => {
    const anchor = { x: 50, y: 11 };
    const name = {
      id: "name",
      text: text({ x0: 0, y0: 0, x1: 100, y1: 11 }, anchor, TEXT_RANK.name),
    };
    const reading = {
      id: "reading",
      text: text({ x0: 30, y0: 14, x1: 70, y1: 32 }, anchor, TEXT_RANK.reading),
    };
    for (const k of [2 ** (1 / 8), 1.5, 2, 3, 5]) {
      expect(declutter([name, reading], k).size).toBe(0);
    }
  });

  it("hides the text its growth takes past the frame, and only that", () => {
    const frame = { x0: -100, y0: -100, x1: 100, y1: 100 };
    const inner = {
      id: "inner",
      text: text({ x0: 0, y0: 0, x1: 20, y1: 10 }, { x: 0, y: 10 }, 1),
    };
    // Grows right from its left edge: widened to [58, 82], then about
    // x = 60 at k = 2 to [56, 104], past the frame.
    const edge = {
      id: "edge",
      text: text({ x0: 60, y0: -50, x1: 80, y1: -40 }, { x: 60, y: -40 }, 1),
    };
    expect(declutter([inner, edge], 2, frame)).toEqual(new Set(["edge"]));
    // Without a frame nothing clips it.
    expect(declutter([inner, edge], 2).size).toBe(0);
    // Grown to exactly the frame's edge it still fits.
    const flush = {
      id: "flush",
      text: text({ x0: 0, y0: 0, x1: 50, y1: 10 }, { x: 0, y: 10 }, 1),
    };
    // Widened by 5 per side: [-5, 55] about x = 0 at k = 2 is [-10, 110].
    expect(declutter([flush], 2, { ...frame, x1: 110 }).size).toBe(0);
    expect(declutter([flush], 2, { ...frame, x1: 109.9 })).toEqual(
      new Set(["flush"]),
    );
  });

  it("over any layout, keeps no two grown texts overlapping, keeps every kept one inside the frame, and hides none without a cause", () => {
    const random = lcg(20260924);
    const frame = { x0: 0, y0: 0, x1: 400, y1: 300 };
    const ks = [2 ** (1 / 8), 1.3, 2, 3.2];
    let hiddenSeen = 0;
    let keptSeen = 0;
    for (let layout = 0; layout < 60; layout++) {
      const count = 3 + Math.floor(random() * 14);
      const items = Array.from({ length: count }, (_, i) => {
        const w = 8 + Math.floor(random() * 90);
        const h = 6 + Math.floor(random() * 30);
        const x0 = Math.floor(random() * (400 - w));
        const y0 = Math.floor(random() * (300 - h));
        const box = { x0, y0, x1: x0 + w, y1: y0 + h };
        // Anchors at a corner, the middle of an edge, the centre, or off
        // the box (a leader's end), as the plate hangs its text.
        const ax = [x0, x0 + w / 2, x0 + w, x0 - 12, x0 + w + 12][
          Math.floor(random() * 5)
        ];
        const ay = [y0, y0 + h / 2, y0 + h, y0 + h + 9][
          Math.floor(random() * 4)
        ];
        const rank = Math.floor(random() * 5);
        // One item in five is not text: a body, a run.
        return random() < 0.2
          ? { id: `n${i}` }
          : { id: `t${i}`, text: text(box, { x: ax, y: ay }, rank) };
      });
      for (const k of ks) {
        const hidden = declutter(items, k, frame);
        const texts = items.filter(
          (item): item is { id: string; text: TextFootprint } =>
            item.text !== undefined,
        );
        const order = [...texts]
          .map((t, i) => ({ ...t, i }))
          .sort((a, b) => a.text.rank - b.text.rank || a.i - b.i);
        const drawn = (t: { text: TextFootprint }) =>
          grownAbout(t.text.box, t.text.anchor, k);
        const slack = (t: { text: TextFootprint }) => {
          const pad = (t.text.box.x1 - t.text.box.x0) * 0.1;
          return grownAbout(
            { ...t.text.box, x0: t.text.box.x0 - pad, x1: t.text.box.x1 + pad },
            t.text.anchor,
            k,
          );
        };
        const kept = order.filter((t) => !hidden.has(t.id));
        // Only text is ever hidden.
        for (const id of hidden) expect(id.startsWith("t")).toBe(true);
        // What stays reads apart and whole.
        kept.forEach((a, i) => {
          expect(inside(drawn(a), frame)).toBe(true);
          kept
            .slice(i + 1)
            .forEach((b) =>
              expect(overlapping(drawn(a), drawn(b))).toBe(false),
            );
        });
        // What goes had to: past the frame, or over a text kept before it.
        order.forEach((t, i) => {
          if (!hidden.has(t.id)) return;
          const before = order.slice(0, i).filter((o) => !hidden.has(o.id));
          expect(
            !inside(slack(t), frame) ||
              before.some((o) => overlapping(slack(o), slack(t))),
          ).toBe(true);
        });
        hiddenSeen += hidden.size;
        keptSeen += kept.length;
      }
    }
    // The sweep is not vacuous: plenty of both.
    expect(hiddenSeen).toBeGreaterThan(200);
    expect(keptSeen).toBeGreaterThan(200);
  });
});

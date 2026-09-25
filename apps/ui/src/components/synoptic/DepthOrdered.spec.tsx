import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepthOrdered, type DepthItem } from "./DepthOrdered";
import { TEXT_RANK, TextScaleContext } from "./legibility";
import type { Box } from "./placement";

afterEach(cleanup);

const ids = (container: HTMLElement) =>
  [...container.querySelectorAll("rect")].map((r) =>
    r.getAttribute("data-testid"),
  );

describe("DepthOrdered", () => {
  it("renders items in ascending depth whatever their input order", () => {
    const { container } = render(
      <svg>
        <DepthOrdered
          items={[
            { id: "front", depth: 9, node: <rect data-testid="front" /> },
            { id: "back", depth: -1, node: <rect data-testid="back" /> },
            { id: "middle", depth: 3, node: <rect data-testid="middle" /> },
          ]}
        />
      </svg>,
    );
    expect(ids(container)).toEqual(["back", "middle", "front"]);
  });

  it("keeps input order for equal depths while still sorting the rest", () => {
    const { container } = render(
      <svg>
        <DepthOrdered
          items={[
            { id: "b", depth: 1, node: <rect data-testid="b" /> },
            { id: "a", depth: 1, node: <rect data-testid="a" /> },
            { id: "c", depth: 0, node: <rect data-testid="c" /> },
          ]}
        />
      </svg>,
    );
    expect(ids(container)).toEqual(["c", "b", "a"]);
  });
});

/** The affine map a `transform` attribute of translates and scales draws
 *  with, applied to a point: read off the attribute, not rebuilt from the
 *  component's own formula. */
function mapThrough(transform: string | null) {
  const ops = [
    ...(transform ?? "").matchAll(/(translate|scale)\(([^)]*)\)/g),
  ].map(([, op, args]) => {
    const [a, b] = args.split(/[\s,]+/).map(Number);
    return { op, a, b: b ?? (op === "scale" ? a : 0) };
  });
  return (p: { x: number; y: number }) =>
    // SVG applies the rightmost operation first.
    ops.reduceRight(
      (q, { op, a, b }) =>
        op === "scale"
          ? { x: q.x * a, y: q.y * b }
          : { x: q.x + a, y: q.y + b },
      p,
    );
}

const mapBox = (transform: string | null, box: Box): Box => {
  const m = mapThrough(transform);
  const a = m({ x: box.x0, y: box.y0 });
  const b = m({ x: box.x1, y: box.y1 });
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
};

const overlapping = (a: Box, b: Box) =>
  a.x0 < b.x1 - 1e-9 &&
  b.x0 < a.x1 - 1e-9 &&
  a.y0 < b.y1 - 1e-9 &&
  b.y0 < a.y1 - 1e-9;

function drawAt(k: number, items: DepthItem[], frame?: Box) {
  const { container } = render(
    <svg>
      <TextScaleContext.Provider value={k}>
        <DepthOrdered items={items} frame={frame} />
      </TextScaleContext.Provider>
    </svg>,
  );
  /** The group DepthOrdered wraps an item's node in. */
  const wrapper = (id: string) =>
    container.querySelector(`[data-testid='${id}']`)!.parentElement!;
  return { container, wrapper };
}

const NAME_BOX = { x0: 0, y0: 0, x1: 40, y1: 11 };
const NOTE_BOX = { x0: 20, y0: 6, x1: 60, y1: 17 };

describe("DepthOrdered text held legible", () => {
  it("grows a text about its anchor, which stays put, and leaves the rest of the plate alone", () => {
    const anchor = { x: 10, y: 20 };
    const { wrapper } = drawAt(2, [
      {
        id: "name",
        depth: 1,
        node: <rect data-testid="name" />,
        text: { anchor, box: NAME_BOX, rank: TEXT_RANK.name },
      },
      { id: "body", depth: 0, node: <rect data-testid="body" /> },
    ]);
    const t = wrapper("name").getAttribute("transform");
    const m = mapThrough(t);
    expect(m(anchor)).toEqual(anchor);
    // Twice as far from the anchor, in both directions.
    expect(m({ x: 0, y: 0 })).toEqual({ x: -10, y: -20 });
    expect(m({ x: 40, y: 11 })).toEqual({ x: 70, y: 2 });
    // Not text: never scaled, never hidden.
    expect(wrapper("body").getAttribute("transform")).toBeNull();
    expect(wrapper("body").getAttribute("display")).toBeNull();
  });

  it("draws the text as it is at scale 1: no transform, nothing hidden", () => {
    const { wrapper } = drawAt(1, [
      {
        id: "name",
        depth: 0,
        node: <rect data-testid="name" />,
        text: { anchor: { x: 0, y: 11 }, box: NAME_BOX, rank: TEXT_RANK.name },
      },
      {
        id: "note",
        depth: 0,
        node: <rect data-testid="note" />,
        text: { anchor: { x: 20, y: 17 }, box: NOTE_BOX, rank: TEXT_RANK.note },
      },
    ]);
    for (const id of ["name", "note"]) {
      expect(wrapper(id).getAttribute("transform")).toBeNull();
      expect(wrapper(id).getAttribute("display")).toBeNull();
      expect(wrapper(id).hasAttribute("data-text-hidden")).toBe(false);
    }
  });

  it("hides the text that gives way, and only it", () => {
    const { wrapper } = drawAt(2, [
      {
        id: "note",
        depth: 0,
        node: <rect data-testid="note" />,
        text: { anchor: { x: 20, y: 17 }, box: NOTE_BOX, rank: TEXT_RANK.note },
      },
      {
        id: "name",
        depth: 0,
        node: <rect data-testid="name" />,
        text: { anchor: { x: 0, y: 11 }, box: NAME_BOX, rank: TEXT_RANK.name },
      },
    ]);
    expect(wrapper("note").getAttribute("display")).toBe("none");
    expect(wrapper("note").hasAttribute("data-text-hidden")).toBe(true);
    expect(wrapper("name").getAttribute("display")).toBeNull();
    expect(wrapper("name").hasAttribute("data-text-hidden")).toBe(false);
  });

  it("gives way among equal ranks in the order the items come in, not the order they are painted", () => {
    const { wrapper } = drawAt(2, [
      {
        id: "first",
        depth: 9,
        node: <rect data-testid="first" />,
        text: { anchor: { x: 0, y: 11 }, box: NAME_BOX, rank: TEXT_RANK.tag },
      },
      {
        id: "second",
        depth: 0,
        node: <rect data-testid="second" />,
        text: { anchor: { x: 20, y: 17 }, box: NOTE_BOX, rank: TEXT_RANK.tag },
      },
    ]);
    expect(wrapper("first").getAttribute("display")).toBeNull();
    expect(wrapper("second").getAttribute("display")).toBe("none");
  });

  it("hides the text its growth takes past the frame it is given", () => {
    const items: DepthItem[] = [
      {
        id: "edge",
        depth: 0,
        node: <rect data-testid="edge" />,
        text: {
          anchor: { x: 60, y: 10 },
          box: { x0: 60, y0: 0, x1: 90, y1: 10 },
          rank: TEXT_RANK.name,
        },
      },
    ];
    const frame = { x0: 0, y0: -50, x1: 100, y1: 50 };
    expect(
      drawAt(2, items, frame).wrapper("edge").getAttribute("display"),
    ).toBe("none");
    cleanup();
    expect(drawAt(2, items).wrapper("edge").getAttribute("display")).toBeNull();
  });

  it("over a crowded layout, draws no two visible texts over each other nor past the frame", () => {
    // A lattice of labels 30 × 11 every 24 px across and 14 down, hung from
    // assorted points: at k = 2 most of them collide.
    const items: DepthItem[] = [];
    const anchors = [
      (b: Box) => ({ x: b.x0, y: b.y1 }),
      (b: Box) => ({ x: (b.x0 + b.x1) / 2, y: b.y1 }),
      (b: Box) => ({ x: b.x1, y: b.y0 }),
      (b: Box) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }),
      (b: Box) => ({ x: b.x0 - 15, y: b.y1 + 8 }),
    ];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const i = row * 7 + col;
        const box = {
          x0: 20 + col * 24,
          y0: 20 + row * 14,
          x1: 50 + col * 24,
          y1: 31 + row * 14,
        };
        items.push({
          id: `t${i}`,
          depth: (i * 7) % 11,
          node: <rect data-testid={`t${i}`} />,
          text: { anchor: anchors[i % 5](box), box, rank: i % 5 },
        });
      }
    }
    const frame = { x0: 0, y0: 0, x1: 220, y1: 150 };
    for (const k of [1.5, 2, 3]) {
      const { wrapper } = drawAt(k, items, frame);
      const visible = items
        .filter((item) => wrapper(item.id).getAttribute("display") !== "none")
        .map((item) =>
          mapBox(wrapper(item.id).getAttribute("transform"), item.text!.box),
        );
      expect(visible.length).toBeGreaterThan(1);
      expect(visible.length).toBeLessThan(items.length);
      visible.forEach((a, i) => {
        expect(a.x0).toBeGreaterThanOrEqual(frame.x0);
        expect(a.y0).toBeGreaterThanOrEqual(frame.y0);
        expect(a.x1).toBeLessThanOrEqual(frame.x1);
        expect(a.y1).toBeLessThanOrEqual(frame.y1);
        visible
          .slice(i + 1)
          .forEach((b) => expect(overlapping(a, b)).toBe(false));
      });
      cleanup();
    }
  });
});

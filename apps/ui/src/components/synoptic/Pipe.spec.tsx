import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { flowDelay, flowShift, Pipe } from "./Pipe";

function draw(props: Omit<Parameters<typeof Pipe>[0], "fluid">) {
  const { container } = render(
    <svg>
      <Pipe fluid="dhw" {...props} />
    </svg>,
  );
  return {
    g: container.querySelector("g")!,
    paths: [...container.querySelectorAll("path:not([data-casing])")].map((p) =>
      p.getAttribute("d"),
    ),
    casing: container.querySelector("path[data-casing]"),
    pipe: container.querySelector("path:not([data-casing])")!,
    arrows: [...container.querySelectorAll("polygon")].map((p) =>
      p.getAttribute("points"),
    ),
  };
}

const RUN = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe("Pipe arrows", () => {
  it("points each head outward and pulls the line back behind it", () => {
    const { paths, arrows } = draw({
      points: RUN,
      startArrow: true,
      endArrow: true,
    });
    expect(arrows).toEqual(["100,0 91,4.5 91,-4.5", "0,0 9,-4.5 9,4.5"]);
    expect(paths).toEqual(["M 6 0 L 94 0"]);
  });

  it("keeps both heads outward on a run shorter than two pull-backs", () => {
    const { paths, arrows } = draw({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      startArrow: true,
      endArrow: true,
    });
    expect(arrows).toEqual(["10,0 1,4.5 1,-4.5", "0,0 9,-4.5 9,4.5"]);
    expect(paths).toEqual(["M 5 0 L 5 0"]);
  });

  it("draws no head on a segment shorter than the head", () => {
    const { paths, arrows } = draw({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 6 },
      ],
      endArrow: true,
    });
    expect(arrows).toEqual([]);
    expect(paths).toEqual(["M 0 0 L 97 0 Q 100 0 100 3 L 100 6"]);
  });
});

describe("Pipe stroke", () => {
  it("is 6 px of fluid colour on a 10 px plate casing", () => {
    const { casing, pipe } = draw({ points: RUN });
    expect(pipe.getAttribute("stroke-width")).toBe("6");
    expect(pipe.getAttribute("class")).toBe("stroke-fluid-dhw");
    expect(casing?.getAttribute("stroke-width")).toBe("10");
    expect(casing?.getAttribute("class")).toBe("stroke-synoptic-plate");
    expect(casing?.getAttribute("d")).toBe(pipe.getAttribute("d"));
  });

  it("keeps the casing 4 px wider than a custom width", () => {
    const { casing, pipe } = draw({ points: RUN, width: 8 });
    expect(pipe.getAttribute("stroke-width")).toBe("8");
    expect(casing?.getAttribute("stroke-width")).toBe("12");
  });
});

describe("Pipe flow state", () => {
  it.each([undefined, false])(
    "is static at full strength when flow is %s",
    (flowing) => {
      const { g, paths } = draw({ points: RUN, flowing });
      expect(g.getAttribute("opacity")).toBeNull();
      expect(paths).toHaveLength(1);
    },
  );

  it("draws the flow dash on the capped path, not through the arrow", () => {
    const { paths } = draw({ points: RUN, endArrow: true, flowing: true });
    expect(paths).toEqual(["M 0 0 L 94 0", "M 0 0 L 94 0"]);
  });
});

/** The moving dash as the stylesheet runs it: the `flow` keyframes and
 *  animation of the Tailwind config, read from the file rather than from
 *  the component, so the two cannot drift apart unnoticed. */
const TAILWIND = readFileSync(
  resolve(import.meta.dirname, "../../../tailwind.config.js"),
  "utf8",
);
const KEYFRAMES =
  /flow:\s*\{\s*from:\s*\{\s*strokeDashoffset:\s*"(-?[\d.]+)"\s*\},\s*to:\s*\{\s*strokeDashoffset:\s*"(-?[\d.]+)"\s*\}/.exec(
    TAILWIND,
  )!;
const ANIMATION = /flow:\s*"flow ([\d.]+)s linear infinite"/.exec(TAILWIND)!;
const FROM = Number(KEYFRAMES[1]);
const TO = Number(KEYFRAMES[2]);
const SECONDS = Number(ANIMATION[1]);

/** Where the dash pattern stands, as a stroke-dashoffset modulo `period`,
 *  `t` seconds into the page for a path animated with `delay`. */
const dashAt = (t: number, delay: number, period: number) => {
  const cycle = (((t - delay) % SECONDS) + SECONDS) % SECONDS;
  const offset = FROM + ((TO - FROM) * cycle) / SECONDS;
  return ((offset % period) + period) % period;
};
const sameModulo = (a: number, b: number, period: number) => {
  const d = (((a - b) % period) + period) % period;
  return Math.min(d, period - d) < 1e-6;
};

const PHASES = [
  0,
  1,
  9.5,
  10,
  13,
  25.9,
  26,
  27,
  51,
  52,
  100,
  333.3,
  1e4 + 7,
  -1,
  -26,
  -40.25,
];

describe("Pipe moving dash", () => {
  it("runs the stylesheet's keyframes from zero, one pattern period at a time", () => {
    expect(KEYFRAMES).not.toBeNull();
    expect(ANIMATION).not.toBeNull();
    // Pinned at 0 on the way in: the piece's own offset must not be the
    // animation's start.
    expect(FROM).toBe(0);
    const { flow } = drawFlowing(0);
    const [dash, gap] = flow
      .getAttribute("stroke-dasharray")!
      .split(/[\s,]+/)
      .map(Number);
    // The travel is a whole number of dash periods, or the loop would jump.
    const periods = Math.abs(TO - FROM) / (dash + gap);
    expect(Math.abs(periods - Math.round(periods))).toBeLessThan(1e-9);
    expect(periods).toBeGreaterThanOrEqual(1);
  });

  it("shifts the still dash by the phase, within one pattern period", () => {
    for (const phase of PHASES) {
      const shift = flowShift(phase);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThan(26);
      expect(sameModulo(shift, phase, 26)).toBe(true);
    }
  });

  it("delays the moving dash into its cycle so it stands exactly `phase` ahead of an unshifted piece, at every moment", () => {
    for (const phase of PHASES) {
      const delay = flowDelay(phase);
      // Negative: the piece is mid-cycle from its first frame, never waiting.
      expect(delay).toBeLessThanOrEqual(0);
      expect(delay).toBeGreaterThan(-SECONDS);
      for (const t of [0, 0.1, 0.37, 0.6, 1.19, 2.5, 7.77]) {
        expect(
          sameModulo(
            dashAt(t, delay, 26) - dashAt(t, flowDelay(0), 26),
            phase,
            26,
          ),
        ).toBe(true);
      }
    }
  });

  it("draws the dash with its shift and delay, marked for motion-reduced pages to hold still, on a group naming its run", () => {
    const { g, flow } = drawFlowing(40, "sup");
    expect(g.getAttribute("data-run")).toBe("sup");
    expect(Number(flow.getAttribute("stroke-dashoffset"))).toBeCloseTo(14, 9);
    expect(parseFloat(flow.style.animationDelay)).toBeCloseTo(flowDelay(40), 9);
    expect(flow.getAttribute("class")).toContain("animate-flow");
    expect(flow.getAttribute("class")).toContain("motion-reduce:animate-none");
    expect(flow.hasAttribute("data-flow")).toBe(true);
    // Without a phase it starts at the beginning of its run.
    expect(drawFlowing(undefined).flow.getAttribute("stroke-dashoffset")).toBe(
      "0",
    );
  });
});

function drawFlowing(phase: number | undefined, run?: string) {
  const { container } = render(
    <svg>
      <Pipe fluid="dhw" points={RUN} flowing phase={phase} run={run} />
    </svg>,
  );
  return {
    g: container.querySelector("g")!,
    flow: container.querySelector("path[data-flow]") as SVGPathElement,
  };
}

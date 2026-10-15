import { useEffect, useRef, type RefObject } from "react";
import {
  fanTransform,
  hslTokenToRgb,
  levelAt,
  temperatureColor,
  type FigureData,
  type FigureMode,
  type FigurePiece,
  type SensorPiece,
  type TemperaturePalette,
  type ComponentPiece,
} from "./figureModel";

/** What the figure shows: the mode, whether it runs, the text of each
 *  callout. A sensor whose reading is null has its callout hidden. */
export type AwhpFigureState = {
  mode: FigureMode;
  running: boolean;
  /** Formatted reading per sensor, null when the device does not report it. */
  readings: Record<SensorPiece, string | null>;
  /** Label text per named part; the water ends and outdoor probe name
   *  their sensor. */
  names: Record<ComponentPiece | "inlet_t" | "outlet_t" | "outdoor_t", string>;
};

export type AwhpFigureOptions = {
  data: FigureData;
  state: AwhpFigureState;
  onSelect?: (piece: FigurePiece | null) => void;
  /** The least a label may show on screen, in px; the text grows to it
   *  when the figure renders small. */
  minTextPx?: number;
};

/** Fallback hues when the theme tokens cannot be read (tests). */
const FALLBACK_PALETTE: TemperaturePalette = {
  cold: [59, 130, 246],
  neutral: [125, 125, 128],
  hot: [242, 123, 42],
};

const FAN_SPEED = 5.2; // rad/s at full speed
const FAN_SETTLE = 1.2; // s, critically damped speed change
const NAME_FONT_PX = 9.5; // the drawn size of a label, in viewBox units

type LabelNodes = {
  el: SVGElement;
  name: SVGElement | null;
  value: SVGElement | null;
};

type Nodes = {
  svg: SVGSVGElement;
  pieces: { el: Element; piece: string }[];
  flows: SVGElement[];
  stops: { el: SVGStopElement; flow: string; s: number }[];
  labels: Map<string, LabelNodes>;
  arrows: Map<string, SVGElement>;
  blades: SVGGElement | null;
};

function collect(root: HTMLElement): Nodes | null {
  const svg = root.querySelector("svg");
  if (!svg) return null;
  const labels = new Map<string, LabelNodes>();
  for (const el of svg.querySelectorAll<SVGElement>(".aw-label")) {
    labels.set(el.dataset.piece ?? "", {
      el,
      name: el.querySelector(".aw-l-name"),
      value: el.querySelector(".aw-l-value"),
    });
  }
  const arrows = new Map<string, SVGElement>();
  for (const el of svg.querySelectorAll<SVGElement>(".aw-arrow")) {
    arrows.set(el.dataset.piece ?? "", el);
  }
  return {
    svg,
    pieces: [
      ...svg.querySelectorAll<SVGElement>(".it, .aw-label, .aw-arrow"),
    ].map((el) => ({
      el,
      piece: el.dataset.piece ?? "",
    })),
    flows: [...svg.querySelectorAll<SVGElement>(".aw-flow")],
    stops: [
      ...svg.querySelectorAll<SVGStopElement>("linearGradient[data-flow] stop"),
    ].map((el) => ({
      el,
      flow: (el.parentNode as SVGElement).dataset.flow ?? "",
      s: Number(el.dataset.s),
    })),
    labels,
    arrows,
    blades: svg.querySelector<SVGGElement>('[data-part="blades"]'),
  };
}

/** The temperature hues from the theme tokens on the figure, or fallbacks. */
function paletteOf(root: HTMLElement): TemperaturePalette {
  const style = getComputedStyle(root);
  const token = (name: string) => hslTokenToRgb(style.getPropertyValue(name));
  return {
    cold: token("--hvac-cool") ?? FALLBACK_PALETTE.cold,
    neutral: token("--muted-foreground") ?? FALLBACK_PALETTE.neutral,
    hot: token("--hvac-heat") ?? FALLBACK_PALETTE.hot,
  };
}

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Drives the generated heat pump figure inside `root`: writes the readings
 * into their tags and hides the callouts of absent ones, sets the flow
 * direction and the temperature gradients for the mode, turns the fan while
 * the unit runs, and lights the part under the pointer.
 */
export function useAwhpFigure(
  root: RefObject<HTMLElement | null>,
  { data, state, onSelect, minTextPx = 11 }: AwhpFigureOptions,
) {
  const nodesRef = useRef<Nodes | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // The drawing's nodes, found once.
  useEffect(() => {
    nodesRef.current = root.current ? collect(root.current) : null;
    return () => {
      nodesRef.current = null;
    };
  }, [root]);

  // Labels and readings.
  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    for (const [piece, label] of nodes.labels) {
      const name = state.names[piece as keyof AwhpFigureState["names"]];
      if (label.name && name !== undefined) label.name.textContent = name;
      const reading =
        piece in state.readings
          ? state.readings[piece as SensorPiece]
          : undefined;
      if (label.value && reading !== undefined)
        label.value.textContent = reading ?? "";
      const absent = reading === null;
      if (absent) label.el.setAttribute("data-absent", "");
      else label.el.removeAttribute("data-absent");
    }
    for (const [piece, arrow] of nodes.arrows) {
      if (state.readings[piece as SensorPiece] === null)
        arrow.setAttribute("data-absent", "");
      else arrow.removeAttribute("data-absent");
    }
  }, [state.names, state.readings]);

  // Mode: flow direction and temperature colours.
  useEffect(() => {
    const nodes = nodesRef.current;
    const el = root.current;
    if (!nodes || !el) return;
    const directions = data.flows[state.mode];
    for (const flow of nodes.flows) {
      flow.setAttribute(
        "data-dir",
        directions[flow.dataset.flowOf ?? ""] === "back" ? "back" : "fwd",
      );
    }
    const profiles = data.profiles[state.mode];
    const palette = paletteOf(el);
    for (const stop of nodes.stops) {
      const knots = profiles[stop.flow];
      if (knots)
        stop.el.style.stopColor = temperatureColor(
          levelAt(knots, stop.s),
          palette,
        );
    }
    el.style.setProperty(
      "--aw-water-in",
      temperatureColor(levelAt(profiles["water-in"] ?? [], 1), palette),
    );
    el.style.setProperty(
      "--aw-water-out",
      temperatureColor(levelAt(profiles["water-out"] ?? [], 1), palette),
    );
    el.setAttribute("data-mode", state.mode);
  }, [data, root, state.mode]);

  // Running: flow dashes on, fan turning.
  useEffect(() => {
    const nodes = nodesRef.current;
    const el = root.current;
    if (!nodes || !el) return;
    if (state.running) el.setAttribute("data-running", "");
    else el.removeAttribute("data-running");
    const blades = nodes.blades;
    if (!blades || reducedMotion()) return;
    let frame = 0;
    let last = 0;
    let angle = 0;
    const want = state.running ? 1 : 0;
    // Resume from where the blades are, so a restart does not snap them.
    if (blades.dataset.angle) angle = Number(blades.dataset.angle);
    let speed = {
      x: blades.dataset.speed ? Number(blades.dataset.speed) : 0,
      v: 0,
    };
    if (speed.x === want) {
      if (want === 0) return;
      speed = { x: 1, v: 0 };
    }
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const w = 1 / FAN_SETTLE;
      for (let i = 0; i < 4; i++) {
        speed.v += (w * w * (want - speed.x) - 2 * w * speed.v) * (dt / 4);
        speed.x += speed.v * (dt / 4);
      }
      const settled =
        Math.abs(want - speed.x) < 1e-3 && Math.abs(speed.v) < 1e-3;
      if (settled) {
        speed = { x: want, v: 0 };
      }
      if (speed.x > 0) {
        angle = (angle + dt * FAN_SPEED * speed.x) % (Math.PI * 2);
        blades.setAttribute("transform", fanTransform(data.fan, angle));
      }
      blades.dataset.angle = String(angle);
      blades.dataset.speed = String(speed.x);
      frame = settled && want === 0 ? 0 : requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data.fan, root, state.running]);

  // Selection by pointer.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const select = (piece: FigurePiece | null) => {
      const nodes = nodesRef.current;
      if (!nodes) return;
      for (const node of nodes.pieces) {
        if (piece !== null && node.piece === piece)
          node.el.setAttribute("data-on", "");
        else node.el.removeAttribute("data-on");
      }
      if (piece) el.setAttribute("data-focus", "");
      else el.removeAttribute("data-focus");
      selectRef.current?.(piece);
    };
    const over = (event: Event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>(
        ".it, .aw-label, .aw-arrow",
      );
      if (target) select((target.dataset.piece ?? null) as FigurePiece | null);
    };
    const leave = () => select(null);
    el.addEventListener("pointerover", over);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointerover", over);
      el.removeEventListener("pointerleave", leave);
    };
  }, [root]);

  // Label size: hold the text at `minTextPx` on screen when the figure is small.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const pxPerUnit = el.clientWidth / data.width;
      const scale =
        pxPerUnit > 0 ? Math.max(1, minTextPx / (NAME_FONT_PX * pxPerUnit)) : 1;
      el.style.setProperty("--awhp-text-scale", scale.toFixed(3));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [data.width, minTextPx, root]);
}

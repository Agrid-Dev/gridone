import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SILENT_TEXT } from "./Chip";
import {
  Panel,
  panelHeight,
  PANEL_W,
  panelWidth,
  type PanelRow,
} from "./Panel";
import { textWidth } from "./text";
import type { SlotReading } from "./values";

afterEach(cleanup);

const reading = (
  text: string | null,
  stale = false,
  unit: string | null = null,
  word = false,
): SlotReading => ({
  text,
  unit,
  raw: text,
  stale,
  faulty: false,
  word,
});

const ROWS: PanelRow[] = [
  { label: "state", reading: reading("MARCHE", false, null, true) },
  {
    label: "fault",
    reading: reading("NORMAL", false, null, true),
    error: true,
  },
  { label: "supply temp", reading: reading("52.4", true, "°C") },
  { label: "power", reading: reading(null) },
  { label: "return temp", reading: reading("47.1", false, "°C") },
];

const draw = (props: Partial<Parameters<typeof Panel>[0]>) => {
  const { container } = render(
    <svg>
      <Panel at={{ x: 200, y: 300 }} title="PAC 03" rows={ROWS} {...props} />
    </svg>,
  );
  const rows = [...container.querySelectorAll("[data-row]")];
  return {
    frame: container.querySelector("rect")!,
    led: container.querySelector("circle:not([data-row] circle)"),
    rows,
    value: (i: number) => rows[i].querySelectorAll("text")[1],
  };
};

describe("Panel", () => {
  it("stands on its anchor, one row per slot", () => {
    const { frame, rows } = draw({});
    expect(rows).toHaveLength(5);
    expect(frame.getAttribute("width")).toBe(String(PANEL_W));
    expect(frame.getAttribute("height")).toBe(String(panelHeight(5)));
    expect(Number(frame.getAttribute("y")) + panelHeight(5)).toBe(300);
    expect(Number(frame.getAttribute("x")) + PANEL_W / 2).toBe(200);
    expect(panelHeight(0)).toBeLessThan(panelHeight(1));
  });

  it("draws no LED without a state and a green or muted one with", () => {
    expect(draw({}).led).toBeNull();
    expect(draw({ led: "on" }).led?.classList.contains("fill-status-ok")).toBe(
      true,
    );
    expect(
      draw({ led: "off" }).led?.classList.contains("fill-muted-foreground"),
    ).toBe(true);
  });

  it("marks a stale row muted with a disc, a silent row with a dash", () => {
    const { rows, value } = draw({});
    expect(rows[2].getAttribute("data-row")).toBe("stale");
    expect(rows[2].querySelector("circle")).not.toBeNull();
    expect(value(2).classList.contains("fill-muted-foreground")).toBe(true);
    // The unit is its own muted text, end-aligned after the value.
    const unit = rows[2].querySelector("[data-unit]")!;
    expect(unit.textContent).toBe("°C");
    expect(unit.classList.contains("fill-muted-foreground")).toBe(true);
    expect(Number(unit.getAttribute("x"))).toBeGreaterThan(
      Number(value(2).getAttribute("x")),
    );
    expect(rows[0].querySelector("[data-unit]")).toBeNull();
    expect(rows[3].getAttribute("data-row")).toBe("silent");
    expect(rows[3].querySelector("circle")).toBeNull();
    expect(value(3).textContent).toBe(SILENT_TEXT);
    expect(rows[0].getAttribute("data-row")).toBe("live");
    // A live number takes the reading colour; a live state word takes the
    // neutral ink, since a green ARRÊT would read as a verdict.
    expect(value(4).classList.contains("fill-synoptic-reading")).toBe(true);
    expect(value(0).classList.contains("fill-foreground")).toBe(true);
    expect(value(0).classList.contains("fill-synoptic-reading")).toBe(false);
  });

  it("reddens the frame, the LED and the fault row only on a faulty device", () => {
    const healthy = draw({ led: "on" });
    expect(healthy.frame.classList.contains("stroke-border")).toBe(true);
    expect(healthy.value(1).classList.contains("fill-foreground")).toBe(true);

    const faulty = draw({ led: "on", fault: "alert" });
    expect(faulty.frame.classList.contains("stroke-status-error")).toBe(true);
    expect(faulty.frame.getAttribute("stroke-width")).toBe("1.5");
    expect(faulty.led?.classList.contains("fill-status-error")).toBe(true);
    expect(faulty.value(1).classList.contains("fill-status-error")).toBe(true);
    // The fault word is a word too: coloured, but never in tabular figures.
    expect(faulty.value(1).classList.contains("tabular-nums")).toBe(false);
    // The state word stays neutral even on a faulty device: the fault
    // colour belongs to the fault row, the frame and the LED.
    expect(faulty.value(0).classList.contains("fill-foreground")).toBe(true);
  });
});

describe("Panel rows of a twin pump", () => {
  it("colours a head's fault word by that head's device, not the panel's", () => {
    const word = reading("NORMAL", false, null, true);
    const { container } = render(
      <svg>
        <Panel
          at={{ x: 200, y: 300 }}
          title="PEC"
          fault="alert"
          rows={[
            { label: "fault a", reading: word, error: true, fault: null },
            { label: "fault b", reading: word, error: true, fault: "alert" },
          ]}
        />
      </svg>,
    );
    const values = [...container.querySelectorAll("[data-row]")].map(
      (row) => row.querySelectorAll("text")[1],
    );
    expect(values[0].classList.contains("fill-status-error")).toBe(false);
    expect(values[1].classList.contains("fill-status-error")).toBe(true);
  });
});

describe("Panel of a twin pump", () => {
  it("lights one LED per head in its title, A then B", () => {
    const { container } = render(
      <svg>
        <Panel
          at={{ x: 200, y: 300 }}
          title="PEC"
          rows={ROWS}
          heads={[
            { state: "on", fault: null },
            { state: undefined, fault: null },
          ]}
        />
      </svg>,
    );
    const leds = [...container.querySelectorAll("[data-led]")];
    expect(leds.map((l) => l.getAttribute("data-led"))).toEqual([
      "on",
      "unknown",
    ]);
    expect(Number(leds[0].getAttribute("cx"))).toBeLessThan(
      Number(leds[1].getAttribute("cx")),
    );
  });
});

describe("Panel width", () => {
  it("grows past its usual width only to keep a long title clear of its LEDs", () => {
    const title = "POMPE DE BOUCLAGE";
    const { container } = render(
      <svg>
        <Panel
          at={{ x: 200, y: 300 }}
          title={title}
          rows={ROWS}
          heads={[
            { state: undefined, fault: null },
            { state: undefined, fault: null },
          ]}
        />
      </svg>,
    );
    const frame = container.querySelector("rect")!;
    const x = Number(frame.getAttribute("x"));
    expect(Number(frame.getAttribute("width"))).toBe(panelWidth(title, 2));
    expect(panelWidth(title, 2)).toBeGreaterThan(PANEL_W);
    const titleEnd = x + 7 + textWidth(title, 11);
    const firstLed = container.querySelector("[data-led]")!;
    expect(Number(firstLed.getAttribute("cx")) - 4).toBeGreaterThan(titleEnd);
    expect(panelWidth("PAC 03", 1)).toBe(PANEL_W);
  });
});

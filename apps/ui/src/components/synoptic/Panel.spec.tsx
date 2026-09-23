import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SILENT_TEXT } from "./Chip";
import { Panel, panelHeight, PANEL_W, type PanelRow } from "./Panel";
import type { SlotReading } from "./values";

afterEach(cleanup);

const reading = (
  text: string | null,
  stale = false,
  unit: string | null = null,
): SlotReading => ({
  text,
  unit,
  raw: text,
  stale,
  faulty: false,
});

const ROWS: PanelRow[] = [
  { label: "state", reading: reading("MARCHE") },
  { label: "fault", reading: reading("NORMAL"), error: true },
  { label: "supply temp", reading: reading("52.4", true, "°C") },
  { label: "power", reading: reading(null) },
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
    expect(rows).toHaveLength(4);
    expect(frame.getAttribute("width")).toBe(String(PANEL_W));
    expect(frame.getAttribute("height")).toBe(String(panelHeight(4)));
    expect(Number(frame.getAttribute("y")) + panelHeight(4)).toBe(300);
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
    expect(value(0).classList.contains("fill-synoptic-reading")).toBe(true);
  });

  it("reddens the frame, the LED and the fault row only on a faulty device", () => {
    const healthy = draw({ led: "on" });
    expect(healthy.frame.classList.contains("stroke-border")).toBe(true);
    expect(healthy.value(1).classList.contains("fill-synoptic-reading")).toBe(
      true,
    );

    const faulty = draw({ led: "on", faulty: true });
    expect(faulty.frame.classList.contains("stroke-status-error")).toBe(true);
    expect(faulty.frame.getAttribute("stroke-width")).toBe("1.5");
    expect(faulty.led?.classList.contains("fill-status-error")).toBe(true);
    expect(faulty.value(1).classList.contains("fill-status-error")).toBe(true);
    expect(faulty.value(0).classList.contains("fill-synoptic-reading")).toBe(
      true,
    );
  });
});

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chip, chipWidth, SILENT_TEXT } from "./Chip";
import type { SlotReading } from "./values";

afterEach(cleanup);

const LIVE: SlotReading = {
  text: "52.4",
  unit: null,
  raw: 52.4,
  stale: false,
  faulty: false,
};

const draw = (reading: Partial<SlotReading> = {}, label?: string) => {
  const { container } = render(
    <svg>
      <Chip
        at={{ x: 100, y: 50 }}
        reading={{ ...LIVE, ...reading }}
        label={label}
      />
    </svg>,
  );
  return {
    g: container.querySelector("[data-chip]")!,
    rect: container.querySelector("rect")!,
    texts: [...container.querySelectorAll("text")],
  };
};

describe("Chip", () => {
  it("is a live value on a solid border by default", () => {
    const { g, rect, texts } = draw({});
    expect(g.getAttribute("data-chip")).toBe("live");
    expect(rect.getAttribute("stroke-dasharray")).toBeNull();
    expect(rect.classList.contains("stroke-border")).toBe(true);
    expect(texts).toHaveLength(1);
    expect(texts[0].textContent).toBe("52.4");
    expect(texts[0].classList.contains("fill-foreground")).toBe(true);
    expect(Number(texts[0].getAttribute("x"))).toBe(100);
  });

  it("draws the unit after the value, 11 px muted, both centred together", () => {
    const { rect, texts } = draw({ unit: "°C" });
    expect(texts.map((t) => t.textContent)).toEqual(["52.4", "°C"]);
    const [value, unit] = texts;
    expect(unit.getAttribute("font-size")).toBe("11");
    expect(unit.classList.contains("fill-muted-foreground")).toBe(true);
    expect(rect.getAttribute("width")).toBe(String(chipWidth("52.4", "°C")));
    // The pair is centred on the anchor: the value moves left by half the
    // unit's width and the unit starts right after the value.
    const valueX = Number(value.getAttribute("x"));
    expect(valueX).toBeLessThan(100);
    expect(Number(unit.getAttribute("x"))).toBeGreaterThan(valueX);
    expect(Number(unit.getAttribute("x"))).toBeLessThan(
      Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")),
    );
    // The unit stays muted on a live value, and the value does not.
    expect(value.classList.contains("fill-foreground")).toBe(true);
  });

  it("dashes the border and mutes the value when stale", () => {
    const { g, rect, texts } = draw({ stale: true });
    expect(g.getAttribute("data-chip")).toBe("stale");
    expect(rect.getAttribute("stroke-dasharray")).toBe("3 2");
    expect(rect.classList.contains("stroke-muted-foreground")).toBe(true);
    expect(texts[0].classList.contains("fill-muted-foreground")).toBe(true);
  });

  it("shows a muted dash on a solid border when silent", () => {
    const { g, rect, texts } = draw({ text: null });
    expect(g.getAttribute("data-chip")).toBe("silent");
    expect(rect.getAttribute("stroke-dasharray")).toBeNull();
    expect(texts[0].textContent).toBe(SILENT_TEXT);
    expect(texts[0].classList.contains("fill-muted-foreground")).toBe(true);
  });

  it("keeps the label above the value, unchanged by staleness", () => {
    const { texts } = draw({ stale: true }, "TT-05");
    expect(texts[0].textContent).toBe("TT-05");
    expect(texts[0].classList.contains("uppercase")).toBe(true);
    expect(Number(texts[0].getAttribute("y"))).toBeLessThan(
      Number(texts[1].getAttribute("y")),
    );
  });

  it("takes the error border for a faulty device", () => {
    const { rect } = draw({ faulty: true });
    expect(rect.classList.contains("stroke-status-error")).toBe(true);
    expect(rect.getAttribute("stroke-width")).toBe("1.5");
  });

  it("sizes the box to its text and centres it on the anchor", () => {
    const { rect } = draw({ text: "12" });
    expect(rect.getAttribute("width")).toBe(String(chipWidth("12")));
    expect(chipWidth("12")).toBe(36);
    expect(chipWidth("1234567890", "kWh")).toBeGreaterThan(chipWidth("12"));
    expect(chipWidth("1234567890", "kWh")).toBeGreaterThan(
      chipWidth("1234567890"),
    );
    expect(Number(rect.getAttribute("x")) + chipWidth("12") / 2).toBe(100);
  });
});

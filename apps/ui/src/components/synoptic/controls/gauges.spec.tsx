import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarMeter } from "./BarMeter";
import { RadialGauge } from "./RadialGauge";

function texts(el: HTMLElement) {
  return [...el.querySelectorAll("text")].map((t) => t.textContent);
}

describe("BarMeter", () => {
  it("prints the raw reading in the error colour when out of range", () => {
    const { container } = render(
      <svg>
        <BarMeter x={0} y={0} min={0} max={100} value={118} unit="°C" />
      </svg>,
    );
    const readout = [...container.querySelectorAll("text")].find((t) =>
      t.textContent?.includes("°C"),
    )!;
    expect(readout.textContent).toBe("118.0 °C");
    expect(readout.getAttribute("class")).toBe("fill-status-error");
    const bar = container.querySelectorAll("rect")[1];
    expect(bar.getAttribute("y")).toBe("2");
    expect(bar.getAttribute("height")).toBe("166");
  });

  it("flags a reading that is not a number", () => {
    const { container } = render(
      <svg>
        <BarMeter x={0} y={0} min={0} max={100} value={Number.NaN} />
      </svg>,
    );
    const readout = [...container.querySelectorAll("text")].at(-1)!;
    expect(readout.textContent).toBe("NaN");
    expect(readout.getAttribute("class")).toBe("fill-status-error");
  });

  it("labels ticks to the readout precision and in register with the bar", () => {
    const { container } = render(
      <svg>
        <BarMeter x={0} y={0} h={170} min={20} max={24} value={24} />
      </svg>,
    );
    expect(texts(container).slice(0, 6)).toEqual([
      "20.0",
      "20.8",
      "21.6",
      "22.4",
      "23.2",
      "24.0",
    ]);
    const topTick = [...container.querySelectorAll("line")][5];
    expect(topTick.getAttribute("y1")).toBe("2");
    expect(container.querySelectorAll("rect")[1].getAttribute("y")).toBe("2");
  });
});

describe("RadialGauge", () => {
  it("prints the raw reading in the error colour when out of range", () => {
    const { container } = render(
      <svg>
        <RadialGauge cx={0} cy={0} r={100} min={0} max={100} value={118} />
      </svg>,
    );
    const all = texts(container);
    expect(all).toContain("118");
    expect(all.slice(0, 6)).toEqual(["0", "20", "40", "60", "80", "100"]);
    const readout = [...container.querySelectorAll("text")].find(
      (t) => t.textContent === "118",
    )!;
    expect(readout.getAttribute("class")).toBe("fill-status-error");
  });

  it("labels ticks to the readout precision", () => {
    const { container } = render(
      <svg>
        <RadialGauge
          cx={0}
          cy={0}
          r={100}
          min={0}
          max={1}
          value={0.5}
          decimals={1}
        />
      </svg>,
    );
    expect(texts(container).slice(0, 6)).toEqual([
      "0.0",
      "0.2",
      "0.4",
      "0.6",
      "0.8",
      "1.0",
    ]);
  });
});

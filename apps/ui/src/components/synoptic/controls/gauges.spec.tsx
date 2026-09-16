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

  it("clamps the setpoint marker to the scale", () => {
    const marker = (setpoint: number) =>
      render(
        <svg>
          <BarMeter
            x={0}
            y={0}
            h={170}
            min={0}
            max={100}
            value={50}
            setpoint={setpoint}
          />
        </svg>,
      )
        .container.querySelector("path")!
        .getAttribute("d");
    // 140 on a 0..100 bar sits on the top graduation, at toY(max) = 2.
    expect(marker(140)).toBe(marker(100));
    expect(marker(140)).toBe("M -10 -5 L -10 9 L 0 2 Z");
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

  it("sweeps a zone the short way round whichever way it is authored", () => {
    const arc = (from: number, to: number) =>
      render(
        <svg>
          <RadialGauge
            cx={0}
            cy={0}
            r={100}
            min={0}
            max={100}
            value={50}
            zones={[{ from, to, level: "error" }]}
          />
        </svg>,
      )
        .container.querySelector("path")!
        .getAttribute("d");
    expect(arc(80, 20)).toBe(arc(20, 80));
    // 20..80 is 60 % of the 270 degree dial: a 162 degree arc, so the
    // large-arc flag stays clear.
    expect(arc(20, 80)).toMatch(/ A 86 86 0 0 1 /);
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

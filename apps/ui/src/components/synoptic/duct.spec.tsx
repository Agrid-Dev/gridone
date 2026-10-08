import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Duct, Readout, StreamBlock } from "./duct";
import { CoilGlyph, FanGlyph } from "./glyphs";

afterEach(cleanup);

const inSvg = (children: ReactNode) => <svg>{children}</svg>;

describe("Duct", () => {
  it("marches the airflow only while a fan runs", () => {
    const { container, rerender } = render(
      inSvg(<Duct x={0} y={0} width={100} dir="right" speed={60} />),
    );
    expect(container.querySelector("animate")).toBeInTheDocument();

    rerender(inSvg(<Duct x={0} y={0} width={100} dir="right" speed={0} />));
    expect(container.querySelector("animate")).not.toBeInTheDocument();
  });

  it("marches the airflow the way the stream flows", () => {
    const { container, rerender } = render(
      inSvg(<Duct x={0} y={0} width={100} dir="right" speed={50} />),
    );
    const toRight = container.querySelector("animate")?.getAttribute("to");
    rerender(inSvg(<Duct x={0} y={0} width={100} dir="left" speed={50} />));
    const toLeft = container.querySelector("animate")?.getAttribute("to");

    expect(Number(toRight)).toBeLessThan(0);
    expect(Number(toLeft)).toBeGreaterThan(0);
  });
});

describe("FanGlyph", () => {
  it("mirrors the blades for a counter-clockwise fan", () => {
    const { container } = render(
      inSvg(<FanGlyph cx={0} cy={0} spinning spin="ccw" title="Fan" />),
    );
    expect(
      container.querySelector("g[transform*='scale(-1 1)']"),
    ).toBeInTheDocument();
  });
});

describe("CoilGlyph", () => {
  const coil = (opening: number | null) =>
    inSvg(
      <CoilGlyph
        cx={20}
        ductY={0}
        colorClass="stroke-hvac-heat"
        fillClass="fill-hvac-heat"
        title="Heating coil"
        opening={opening}
      />,
    );

  it("fills from the bottom in proportion to the valve opening", () => {
    const { container } = render(coil(25));
    const clip = container.querySelector("clipPath rect");
    // 48 tall, so a quarter open fills the bottom 12.
    expect(clip?.getAttribute("height")).toBe("12");
    expect(clip?.getAttribute("y")).toBe("40");
    expect(container.querySelector(".fill-hvac-heat")).toBeInTheDocument();
  });

  it("stays a bare grey skeleton when the valve is closed or unknown", () => {
    for (const opening of [0, null]) {
      const { container, unmount } = render(coil(opening));
      expect(
        container.querySelector(".fill-hvac-heat"),
      ).not.toBeInTheDocument();
      expect(
        container.querySelector(".stroke-hvac-heat"),
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("StreamBlock", () => {
  const rows = [
    {
      kind: "T" as const,
      title: "Supply air · Temperature",
      value: "18,2°",
      setpoints: [
        {
          label: "Setpoint",
          value: "18,0°",
          editLabel: "Edit supply temperature",
          onEdit: vi.fn(),
        },
      ],
    },
  ];

  it("opens the setpoint editor from the keyboard as well as the pointer", async () => {
    const user = userEvent.setup();
    render(inSvg(<StreamBlock x={0} cy={0} title="Supply air" rows={rows} />));

    const button = screen.getByRole("button", {
      name: "Edit supply temperature",
    });
    await user.click(button);
    button.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(rows[0].setpoints[0].onEdit).toHaveBeenCalledTimes(3);
  });

  it("renders a read-only setpoint as plain text", () => {
    const readOnly = [
      {
        ...rows[0],
        setpoints: [{ ...rows[0].setpoints[0], onEdit: undefined }],
      },
    ];
    render(
      inSvg(<StreamBlock x={0} cy={0} title="Supply air" rows={readOnly} />),
    );

    expect(screen.getByText("18,0°")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stacks a second setpoint under the first, each on its own row", () => {
    const deadBand = [
      {
        ...rows[0],
        setpoints: [
          { ...rows[0].setpoints[0], label: "Heating", onEdit: undefined },
          {
            label: "Cooling",
            value: "24,0°",
            editLabel: "Edit cooling temperature",
            onEdit: undefined,
          },
        ],
      },
    ];
    render(
      inSvg(<StreamBlock x={0} cy={0} title="Supply air" rows={deadBand} />),
    );

    expect(screen.getByText("Heating")).toBeInTheDocument();
    expect(screen.getByText("Cooling")).toBeInTheDocument();
    expect(screen.getByText("24,0°")).toBeInTheDocument();
  });
});

describe("Readout", () => {
  it("sets a worded state in the text face, not the numeral one", () => {
    render(
      inSvg(
        <Readout cx={0} y={0} label="Flow switch" value="Proven" textual />,
      ),
    );
    expect(screen.getByText("Proven")).not.toHaveClass("font-mono");
  });
});

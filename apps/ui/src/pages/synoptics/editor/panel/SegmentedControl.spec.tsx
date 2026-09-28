import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";

afterEach(cleanup);

const OPTIONS = [
  { value: "isometric", label: "Isometric" },
  {
    value: "flat",
    label: "Plan",
    disabled: true,
    title: "Something is raised",
  },
];

describe("SegmentedControl", () => {
  it("presses the choice held, and hands back the one clicked", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Opens as"
        value="flat"
        options={[
          { value: "isometric", label: "Isometric" },
          { value: "flat", label: "Plan" },
        ]}
        onChange={onChange}
      />,
    );
    const group = screen.getByRole("group", { name: "Opens as" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Isometric" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Isometric" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("isometric");
  });

  it("takes no click on a choice it refuses, and says why on hover", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Opens as"
        value="isometric"
        options={OPTIONS}
        onChange={onChange}
      />,
    );
    const plan = screen.getByRole("button", { name: "Plan" });
    expect(plan).toHaveProperty("disabled", true);
    expect(plan).toHaveAttribute("title", "Something is raised");
    fireEvent.click(plan);
    expect(onChange).not.toHaveBeenCalled();
  });
  it("reports nothing when the choice already held is pressed again", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Opens as"
        value="flat"
        options={[
          { value: "isometric", label: "Isometric" },
          { value: "flat", label: "Plan" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResourceHeader } from "./ResourceHeader";

afterEach(cleanup);

describe("ResourceHeader", () => {
  it("renders the eyebrow, title, status slot and actions", () => {
    render(
      <ResourceHeader
        resourceName="Devices"
        title="RTU-3"
        status={<span>online</span>}
        actions={<button>Edit</button>}
      />,
    );
    expect(screen.getByText("Devices")).toBeInTheDocument();
    expect(screen.getByText("RTU-3")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("never renders a back link or back-arrow glyph", () => {
    const { container } = render(
      <ResourceHeader resourceName="Drivers" title="acme.rtu" />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("←");
  });
});

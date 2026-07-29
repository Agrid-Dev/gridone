import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResourceHeader } from "./ResourceHeader";

afterEach(cleanup);

describe("ResourceHeader", () => {
  it("renders the title, status slot and actions", () => {
    render(
      <ResourceHeader
        title="RTU-3"
        status={<span>online</span>}
        actions={<button>Edit</button>}
      />,
    );
    expect(screen.getByText("RTU-3")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  // Actions are taller than the title's line box, so they have to share a
  // centred row with it. Sitting beside the title+caption block instead left
  // them visibly low on every header without a caption.
  it("puts actions on the title's row, with the caption below it", () => {
    render(
      <ResourceHeader
        title="RTU-3"
        caption="A caption"
        actions={<button>Edit</button>}
      />,
    );
    const row = screen.getByText("RTU-3").closest("div")?.parentElement;
    expect(row).toContainElement(screen.getByRole("button", { name: "Edit" }));
    expect(row).not.toContainElement(screen.getByText("A caption"));
  });

  it("never renders a back link or back-arrow glyph", () => {
    const { container } = render(<ResourceHeader title="acme.rtu" />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).not.toContain("←");
  });
});

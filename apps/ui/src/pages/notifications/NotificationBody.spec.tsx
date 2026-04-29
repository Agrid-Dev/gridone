import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NotificationBody } from "./NotificationBody";
import type { ResourceType } from "@/lib/resourceReference";

afterEach(() => {
  cleanup();
});

function renderBody(body: string) {
  return render(
    <MemoryRouter>
      <NotificationBody body={body} />
    </MemoryRouter>,
  );
}

describe("NotificationBody", () => {
  it("renders bold and italic markdown", () => {
    const { container } = renderBody("a **bold** and *italic* word");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
  });

  it("renders external https links with target=_blank", () => {
    renderBody("see [docs](https://example.com)");
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it.each<[ResourceType, string, string]>([
    ["device", "resource://device/d1", "/devices/d1"],
    ["driver", "resource://driver/agrid-th", "/drivers/agrid-th"],
    ["transport", "resource://transport/t1", "/transports/t1"],
    ["asset", "resource://asset/a1", "/assets/a1"],
    ["automation", "resource://automation/auto1", "/automations/auto1"],
    ["fault", "resource://fault/f1", "/faults"],
    ["command", "resource://command/c1", "/devices/commands?batch_id=c1"],
  ])("renders %s reference as internal link to %s", (_type, uri, expected) => {
    renderBody(`open [target](${uri})`);
    const link = screen.getByRole("link", { name: "target" });
    expect(link).toHaveAttribute("href", expected);
    expect(link).not.toHaveAttribute("target");
  });

  it("renders unknown resource type as plain text", () => {
    const { container } = renderBody("see [thing](resource://bogus/xyz)");
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.textContent).toContain("thing");
  });

  it("strips raw HTML script tags from the rendered output", () => {
    const { container } = renderBody("<script>alert(1)</script>safe text");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("safe text");
  });

  it("strips disallowed link schemes (e.g. javascript:) to non-link text", () => {
    renderBody("[click](javascript:alert(1))");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("click")).toBeInTheDocument();
  });

  it("renders consecutive newlines as separate paragraphs", () => {
    const { container } = renderBody("first paragraph\n\nsecond paragraph");
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe("first paragraph");
    expect(paragraphs[1].textContent).toBe("second paragraph");
  });
});

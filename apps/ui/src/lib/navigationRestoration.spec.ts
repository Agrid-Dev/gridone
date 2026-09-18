import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureNavigationEntry } from "./navigationRestoration";
import type { NavigationEntry } from "./navigation";

function entry(): NavigationEntry {
  return {
    url: "/devices",
    index: 0,
    context: { visit: "visit" },
    values: {},
  };
}

function linkSelectors(calls: unknown[][]) {
  return calls
    .map(([selector]) => String(selector))
    .filter((selector) => selector.includes("a[href]"));
}

describe("navigation capture", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="main-content">
        <div data-scroll-restoration="table"></div>
        <a href="/devices/a" id="a">A</a>
        <a href="/devices/b" id="b">B</a>
      </main>`;
  });

  // Capture runs on every scroll tick: with nothing focused it must not walk the page.
  it("does not list the page links when no link has focus", () => {
    const query = vi.spyOn(document, "querySelectorAll");

    const captured = captureNavigationEntry(entry());

    expect(linkSelectors(query.mock.calls)).toEqual([]);
    expect(captured.focus).toBeUndefined();
    query.mockRestore();
  });

  it("captures the focused link by href and position", () => {
    document.getElementById("b")!.focus();

    expect(captureNavigationEntry(entry()).focus).toEqual({
      href: "/devices/b",
      index: 1,
    });
  });

  it("keeps the known focus when the focused link is outside the page content", () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<a href="/settings" id="outside">Outside</a>',
    );
    document.getElementById("outside")!.focus();
    const previous = { ...entry(), focus: { href: "/devices/a", index: 0 } };

    expect(captureNavigationEntry(previous).focus).toEqual({
      href: "/devices/a",
      index: 0,
    });
  });

  it("captures the page and container scroll positions", () => {
    const container = document.querySelector<HTMLElement>(
      "[data-scroll-restoration]",
    )!;
    container.scrollTop = 120;

    expect(captureNavigationEntry(entry()).scroll).toEqual({
      page: [0, 0],
      containers: { "table:0": [0, 120] },
    });
  });
});

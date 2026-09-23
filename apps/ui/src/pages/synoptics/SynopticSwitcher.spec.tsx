import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SynopticSummary } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { SynopticStepper, SynopticSwitcher } from "./SynopticSwitcher";

vi.mock("react-i18next", () =>
  createI18nMock({
    "switcher.label": "Switch synoptic",
    "switcher.search": "Search a synoptic",
    "switcher.empty": "No synoptic matches.",
    "switcher.previous": "Previous synoptic",
    "switcher.next": "Next synoptic",
    "switcher.position": "{{position}} / {{total}}",
    "switcher.pin": "Open Synoptics on this view",
    "switcher.pinned": "Opens Synoptics",
    "switcher.current": "Shown now",
  }),
);

afterEach(cleanup);

const PLATES: SynopticSummary[] = [
  {
    id: "ecs",
    name: "ECS Est",
    description: "Hot water loop",
    projection: "isometric",
    metadata: {},
  },
  { id: "west", name: "ECS Ouest", projection: "isometric", metadata: {} },
  {
    id: "cta",
    name: "CTA Nord",
    description: "Air handling",
    projection: "flat",
    metadata: {},
  },
];
const plate = (id: string) => PLATES.find((p) => p.id === id)!;

function renderSwitcher(currentId: string, pinned: string | null = null) {
  const onNavigate = vi.fn();
  render(
    <SynopticSwitcher
      current={plate(currentId)}
      synoptics={PLATES}
      pinned={pinned}
      onNavigate={onNavigate}
    />,
  );
  return { onNavigate };
}

function renderStepper(
  currentId: string,
  {
    pinned = null,
    synoptics = PLATES,
  }: { pinned?: string | null; synoptics?: SynopticSummary[] } = {},
) {
  const onNavigate = vi.fn();
  const onPin = vi.fn();
  const current = PLATES.find((p) => p.id === currentId) ?? {
    id: currentId,
    name: currentId,
  };
  render(
    <SynopticStepper
      current={current}
      synoptics={synoptics}
      pinned={pinned}
      onNavigate={onNavigate}
      onPin={onPin}
    />,
  );
  return { onNavigate, onPin };
}

const trigger = () =>
  document.querySelector<HTMLButtonElement>("[data-synoptic-switcher]")!;
const options = () =>
  [...document.querySelectorAll("[data-synoptic-option]")].map((o) =>
    o.getAttribute("data-synoptic-option"),
  );
const option = (id: string) =>
  document.querySelector<HTMLElement>(`[data-synoptic-option='${id}']`)!;
/** Checked for the eye and named for a screen reader: both, or neither. */
const checked = () =>
  [...document.querySelectorAll("[data-synoptic-option]")]
    .filter((o) => {
      const seen = !!o.querySelector("svg.opacity-100");
      const said = (o.textContent ?? "").includes("Shown now");
      expect(said).toBe(seen);
      return seen;
    })
    .map((o) => o.getAttribute("data-synoptic-option"));
const cursor = () =>
  document
    .querySelector("[data-synoptic-option][data-selected='true']")
    ?.getAttribute("data-synoptic-option");
const position = () =>
  document.querySelector("[data-synoptic-position]")?.textContent ?? null;
const pin = () =>
  screen.getByRole("button", { name: "Open Synoptics on this view" });

describe("SynopticSwitcher", () => {
  it("titles the page with the current plate and lists every plate, the current one checked", async () => {
    renderSwitcher("west");
    expect(trigger().textContent).toBe("ECS Ouest");
    expect(options()).toEqual([]);

    await userEvent.click(trigger());

    expect(options()).toEqual(["ecs", "west", "cta"]);
    expect(checked()).toEqual(["west"]);
    expect(option("ecs").textContent).toContain("Hot water loop");
  });

  it("filters the plates on their description", async () => {
    renderSwitcher("ecs");
    await userEvent.click(trigger());

    await userEvent.type(
      screen.getByPlaceholderText("Search a synoptic"),
      "handling",
    );

    expect(options()).toEqual(["cta"]);
  });

  it("says so when no plate matches the search", async () => {
    renderSwitcher("ecs");
    await userEvent.click(trigger());

    await userEvent.type(
      screen.getByPlaceholderText("Search a synoptic"),
      "zzqx",
    );

    expect(options()).toEqual([]);
    expect(screen.getByText("No synoptic matches.")).toBeInTheDocument();
  });

  it("opens another plate once and closes the menu", async () => {
    const { onNavigate } = renderSwitcher("ecs");
    await userEvent.click(trigger());

    await userEvent.click(option("cta"));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("cta");
    await waitFor(() => expect(options()).toEqual([]));
  });

  it("only closes the menu when the current plate is picked", async () => {
    const { onNavigate } = renderSwitcher("west");
    await userEvent.click(trigger());

    await userEvent.click(option("west"));

    expect(onNavigate).not.toHaveBeenCalled();
    await waitFor(() => expect(options()).toEqual([]));
  });

  it("opens the keyboard cursor on the current plate, so an arrow reaches its neighbour", async () => {
    const { onNavigate } = renderSwitcher("west");
    await userEvent.click(trigger());
    await waitFor(() => expect(cursor()).toBe("west"));

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("cta");
  });

  it("opens the cursor on the current plate even when its name starts with a space", async () => {
    const spaced = { ...plate("west"), name: " ECS Ouest" };
    render(
      <SynopticSwitcher
        current={spaced}
        synoptics={[plate("ecs"), spaced, plate("cta")]}
        pinned={null}
        onNavigate={vi.fn()}
      />,
    );
    await userEvent.click(trigger());

    await waitFor(() => expect(cursor()).toBe("west"));
  });

  it("stars the pinned plate for sighted and screen-reader users alike", async () => {
    renderSwitcher("ecs", "cta");
    await userEvent.click(trigger());

    expect(option("cta").textContent).toContain("Opens Synoptics");
    expect(option("ecs").textContent).not.toContain("Opens Synoptics");
    expect(option("west").textContent).not.toContain("Opens Synoptics");
  });

  it("stars nothing when no plate is pinned", async () => {
    renderSwitcher("ecs");
    await userEvent.click(trigger());
    expect(screen.queryByText("Opens Synoptics")).toBeNull();
  });
});

describe("SynopticStepper", () => {
  it("tells where the current plate stands in the list", () => {
    renderStepper("west");
    expect(position()).toBe("2 / 3");
  });

  it("steps to the neighbours in list order", async () => {
    const { onNavigate } = renderStepper("west");
    await userEvent.click(
      screen.getByRole("button", { name: "Next synoptic" }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith("cta");
    await userEvent.click(
      screen.getByRole("button", { name: "Previous synoptic" }),
    );
    expect(onNavigate).toHaveBeenLastCalledWith("ecs");
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("wraps from the last plate to the first", async () => {
    const { onNavigate } = renderStepper("cta");
    await userEvent.click(
      screen.getByRole("button", { name: "Next synoptic" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("ecs");
  });

  it("wraps from the first plate to the last", async () => {
    const { onNavigate } = renderStepper("ecs");
    await userEvent.click(
      screen.getByRole("button", { name: "Previous synoptic" }),
    );
    expect(onNavigate).toHaveBeenCalledWith("cta");
  });

  it.each([
    ["a single plate", "ecs", [PLATES[0]]],
    ["a plate missing from the list", "gone", PLATES],
  ])(
    "offers no step nor position with %s, but keeps the star",
    (_, currentId, synoptics) => {
      renderStepper(currentId, { synoptics });
      expect(
        screen.queryByRole("button", { name: "Next synoptic" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Previous synoptic" }),
      ).toBeNull();
      expect(position()).toBeNull();
      expect(pin()).toBeInTheDocument();
    },
  );

  it("pins the current plate when it is not the pinned one", async () => {
    const { onPin } = renderStepper("west", { pinned: "ecs" });
    expect(pin().getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(pin());
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onPin).toHaveBeenCalledWith("west");
  });

  it("unpins the current plate when it is the pinned one", async () => {
    const { onPin } = renderStepper("west", { pinned: "west" });
    expect(pin().getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(pin());
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onPin).toHaveBeenCalledWith(null);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { GridoneClient, SynopticSummary } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Synoptics",
    emptyTitle: "No synoptic yet.",
    "editor.new": "New synoptic",
  }),
);

const permissions = { write: false };
vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (permission: string) =>
    permission === "synoptics:write" && permissions.write,
}));

import SynopticsIndex from "./SynopticsIndex";

afterEach(() => {
  cleanup();
  permissions.write = false;
});

function renderIndex(items: SynopticSummary[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = {
    synoptics: { list: vi.fn(async () => ({ items })) },
  } as unknown as GridoneClient;
  render(
    <GridoneClientProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/synoptics"]}>
          <SynopticsIndex />
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
}

describe("SynopticsIndex", () => {
  it("links one card per plate to its detail route", async () => {
    renderIndex([
      {
        id: "ecs",
        name: "ECS Est",
        description: "Hot water",
        projection: "isometric",
        metadata: {},
      },
      { id: "west", name: "ECS Ouest", projection: "flat", metadata: {} },
    ]);
    const cards = await screen.findAllByRole("link");
    expect(cards.map((a) => a.getAttribute("href"))).toEqual([
      "/synoptics/ecs",
      "/synoptics/west",
    ]);
    expect(cards[0].textContent).toContain("Hot water");
  });

  it("shows the empty state without a create action when nothing is stored", async () => {
    renderIndex([]);
    await screen.findByText("No synoptic yet.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers the editor to those who may write, and to nobody else", async () => {
    permissions.write = true;
    renderIndex([]);
    const create = await screen.findByRole("link", { name: "New synoptic" });
    expect(create.getAttribute("href")).toBe("/synoptics/new");
  });
});

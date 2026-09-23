import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  useParams,
} from "react-router";
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

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  permissions.write = false;
  window.localStorage.clear();
});

const summary = (id: string): SynopticSummary => ({
  id,
  name: id,
  projection: "isometric",
  metadata: {},
});
const PLATES = [summary("ecs"), summary("west"), summary("cta")];

/** Where the redirect lands, and how it got there. */
const Landed = () => {
  const { synopticId } = useParams<{ synopticId: string }>();
  const { pathname } = useLocation();
  return (
    <p data-landed={synopticId} data-pathname={pathname}>
      {useNavigationType()}
    </p>
  );
};

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
          <Routes>
            <Route path="/synoptics" element={<SynopticsIndex />} />
            <Route path="/synoptics/:synopticId" element={<Landed />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </GridoneClientProvider>,
  );
}

const landed = async () => {
  const marker = await screen.findByText(/^(PUSH|REPLACE|POP)$/);
  return {
    id: marker.getAttribute("data-landed"),
    pathname: marker.getAttribute("data-pathname"),
    how: marker.textContent,
  };
};

describe("SynopticsIndex", () => {
  it("opens the pinned plate, replacing the index in history", async () => {
    window.localStorage.setItem("gridone.synoptics.default", "cta");
    window.localStorage.setItem("gridone.synoptics.last", "west");
    renderIndex(PLATES);
    expect(await landed()).toEqual({
      id: "cta",
      pathname: "/synoptics/cta",
      how: "REPLACE",
    });
  });

  it("opens the last plate seen when none is pinned", async () => {
    window.localStorage.setItem("gridone.synoptics.last", "west");
    renderIndex(PLATES);
    expect((await landed()).id).toBe("west");
  });

  it("opens the first plate when the remembered ones were deleted", async () => {
    window.localStorage.setItem("gridone.synoptics.default", "gone");
    window.localStorage.setItem("gridone.synoptics.last", "old");
    renderIndex([summary("west"), summary("ecs")]);
    expect((await landed()).id).toBe("west");
  });

  it("encodes an id that is not a plain path segment", async () => {
    window.localStorage.setItem("gridone.synoptics.last", "ecs est/2");
    renderIndex([summary("ecs"), summary("ecs est/2")]);
    expect(await landed()).toMatchObject({
      id: "ecs est/2",
      pathname: "/synoptics/ecs%20est%2F2",
    });
  });

  it("shows the empty state without a create action when nothing is stored", async () => {
    window.localStorage.setItem("gridone.synoptics.default", "ecs");
    renderIndex([]);
    await screen.findByText("No synoptic yet.");
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("[data-landed]")).toBeNull();
  });

  it("offers the editor to those who may write, and to nobody else", async () => {
    permissions.write = true;
    renderIndex([]);
    const create = await screen.findByRole("link", { name: "New synoptic" });
    expect(create.getAttribute("href")).toBe("/synoptics/new");
  });
});

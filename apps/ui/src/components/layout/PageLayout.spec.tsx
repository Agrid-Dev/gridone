import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  PageContainer,
  PageLayoutProvider,
  useFocusedPage,
  useFullBleedPage,
} from "./PageLayout";
import { ShellFrame } from "./ShellFrame";

vi.mock("./ShellNavigation", () => ({
  ShellNavigation: () => <nav aria-label="shell" />,
}));

afterEach(cleanup);

const FullBleed = () => {
  useFullBleedPage();
  return <p>canvas</p>;
};
const Focused = () => {
  useFocusedPage();
  return <p>editor</p>;
};

/** The shell around a page that can be put away, as a route change does. */
function Shell({ page }: { page: ReactNode }) {
  const [shown, setShown] = useState(true);
  return (
    <PageLayoutProvider>
      <button type="button" onClick={() => setShown((s) => !s)}>
        toggle
      </button>
      <ShellFrame>
        <main>
          <PageContainer>{shown ? page : <p>other page</p>}</PageContainer>
        </main>
      </ShellFrame>
    </PageLayoutProvider>
  );
}

const nav = () => screen.queryByRole("navigation", { name: "shell" });
const padded = () => document.querySelector(".max-w-7xl");
const offset = () => document.querySelector(".pt-16");

describe("PageLayout", () => {
  it("gives a full-bleed page the whole content area, inside the shell", () => {
    render(<Shell page={<FullBleed />} />);
    expect(padded()).toBeNull();
    // Mutant: full bleed read as focus puts away a shell the page needs.
    expect(nav()).not.toBeNull();
    expect(offset()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(padded()).not.toBeNull();
  });

  it("gives a focused page the whole window for as long as it stays", () => {
    render(<Shell page={<Focused />} />);
    expect(nav()).toBeNull();
    expect(offset()).toBeNull();
    expect(padded()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(nav()).not.toBeNull();
    expect(offset()).not.toBeNull();
    expect(padded()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(nav()).toBeNull();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PageContainer,
  PageLayoutProvider,
  useFocusedPage,
} from "./PageLayout";
import { ShellFrame } from "./ShellFrame";

vi.mock("./ShellNavigation", () => ({
  ShellNavigation: () => <nav aria-label="shell" />,
}));

afterEach(cleanup);

const Focused = () => {
  useFocusedPage();
  return <p>editor</p>;
};

const shell = (page: ReactNode) =>
  render(
    <PageLayoutProvider>
      <ShellFrame>
        <main>
          <PageContainer>{page}</PageContainer>
        </main>
      </ShellFrame>
    </PageLayoutProvider>,
  );

describe("ShellFrame", () => {
  it("frames an ordinary page with the navigation and its offsets", () => {
    const { container } = shell(<p>page</p>);
    expect(
      screen.getByRole("navigation", { name: "shell" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".pt-16")).not.toBeNull();
    expect(container.querySelector(".max-w-7xl")).not.toBeNull();
  });

  it("steps aside while a page asks for the whole window, and comes back after", () => {
    const { container, rerender } = shell(<Focused />);
    expect(screen.queryByRole("navigation", { name: "shell" })).toBeNull();
    // The content keeps no offset for the missing bars, and no padding.
    expect(container.querySelector(".pt-16")).toBeNull();
    expect(container.querySelector(".max-w-7xl")).toBeNull();
    // The page's own landmark stays: the skip link still has a target.
    expect(screen.getByRole("main")).toBeInTheDocument();
    rerender(
      <PageLayoutProvider>
        <ShellFrame>
          <main>
            <PageContainer>
              <p>page</p>
            </PageContainer>
          </main>
        </ShellFrame>
      </PageLayoutProvider>,
    );
    expect(
      screen.getByRole("navigation", { name: "shell" }),
    ).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import Faults from "./index";

const state = vi.hoisted(() => ({ fail: true }));
vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("./FaultsPage", () => ({ default: () => <p>Live alerts</p> }));
vi.mock("./history/FaultHistoryPage", () => ({
  default: () => {
    if (state.fail) throw new Error("failed history render");
    return <p>History recovered</p>;
  },
}));
afterEach(cleanup);
describe("alert route boundaries", () => {
  it("recovers after navigation to a sibling or different period", async () => {
    state.fail = true;
    render(
      <MemoryRouter initialEntries={["/faults/history"]}>
        <Link to="/faults">Live</Link>
        <Link to="/faults/history?last=1d">Different period</Link>
        <Routes>
          <Route path="/faults/*" element={<Faults />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("errors.default")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Live"));
    expect(screen.getByText("Live alerts")).toBeInTheDocument();
    state.fail = false;
    fireEvent.click(screen.getByText("Different period"));
    expect(await screen.findByText("History recovered")).toBeInTheDocument();
  });
});

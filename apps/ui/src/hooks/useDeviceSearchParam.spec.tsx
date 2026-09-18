import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useDeviceSearchParam } from "./useDeviceSearchParam";
function Search() {
  const { value, change, commit, clear } = useDeviceSearchParam();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <input
        aria-label="Search"
        value={value}
        onChange={(e) => change(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      <button onClick={clear}>Clear</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <output>{location.search}</output>
    </>
  );
}
function mount() {
  render(
    <MemoryRouter
      initialEntries={[
        "/previous?previous=yes",
        "/devices?type=pump&health=faulty",
      ]}
    >
      <Search />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("device name search", () => {
  it("debounces 300ms, combines filters and replaces history", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "pump" },
    });
    act(() => vi.advanceTimersByTime(299));
    expect(screen.getByRole("status")).not.toHaveTextContent("search");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Pump A" },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole("status")).toHaveTextContent(
      "?type=pump&health=faulty&search=Pump+A",
    );
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByRole("status")).toHaveTextContent("?previous=yes");
  });
  it.each(["Enter", "blur"])("flushes the latest text on %s", (event) => {
    mount();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "  Pump  " } });
    if (event === "blur") fireEvent.blur(input);
    else fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("search=Pump");
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByRole("status")).toHaveTextContent(
      "?type=pump&health=faulty",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("search");
  });
});

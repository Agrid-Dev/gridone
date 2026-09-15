import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

function palette(size: number) {
  return (
    <Command label="Palette">
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandGroup heading="Rooms">
          {Array.from({ length: size }, (_, i) => {
            const name = `Room 7${i.toString().padStart(2, "0")}`;
            return (
              <CommandItem key={name} value={name}>
                {name}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

afterEach(cleanup);

describe("CommandList", () => {
  it("returns to the top when the query changes", async () => {
    const user = userEvent.setup();
    render(palette(30));
    const list = screen.getByRole("listbox");
    list.scrollTop = 240;

    await user.type(screen.getByRole("combobox"), "7");

    expect(list.scrollTop).toBe(0);
  });

  it("keeps the scroll position when the results change under a standing query", async () => {
    const user = userEvent.setup();
    const { rerender } = render(palette(30));
    await user.type(screen.getByRole("combobox"), "7");
    const list = screen.getByRole("listbox");
    list.scrollTop = 240;

    rerender(palette(40));

    expect(list.scrollTop).toBe(240);
  });
});

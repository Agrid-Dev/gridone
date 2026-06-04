import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import type { User } from "@/api/users";

vi.mock("react-i18next", () =>
  createI18nMock({
    "pickers.user.label": "Recipients",
    "pickers.user.placeholder": "Select users",
    "pickers.user.search": "Search users",
    "pickers.user.noUsers": "No users found",
  }),
);

const users = [
  { id: "u1", username: "alice", name: "Alice" },
  { id: "u2", username: "bob", name: "Bob" },
] as User[];

const { mockUseUsers } = vi.hoisted(() => ({ mockUseUsers: vi.fn() }));
vi.mock("@/hooks/useUsers", () => ({ useUsers: () => mockUseUsers() }));

// Render the popover/command primitives inline so jsdom can click items
// without Radix/cmdk portal & pointer quirks.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandInput: () => null,
  CommandList: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
  }) => (
    <div role="option" onClick={onSelect}>
      {children}
    </div>
  ),
}));

import { UserPicker } from "./UserPicker";

afterEach(() => {
  cleanup();
  mockUseUsers.mockReset();
});

function setup(value: string[], onChange = vi.fn()) {
  mockUseUsers.mockReturnValue({
    users,
    usersMap: new Map(users.map((u) => [u.id, u])),
    isLoading: false,
  });
  render(<UserPicker value={value} onChange={onChange} />);
  return onChange;
}

describe("UserPicker", () => {
  it("adds a user to the selection when picked", () => {
    const onChange = setup([]);
    fireEvent.click(screen.getByRole("option", { name: /Alice/ }));
    expect(onChange).toHaveBeenCalledWith(["u1"]);
  });

  it("removes an already-selected user when picked again", () => {
    const onChange = setup(["u1"]);
    fireEvent.click(screen.getByRole("option", { name: /Alice/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("summarizes the current selection in the trigger", () => {
    setup(["u1", "u2"]);
    expect(screen.getByRole("combobox")).toHaveTextContent("Alice, Bob");
  });
});

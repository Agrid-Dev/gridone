import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Users",
    subtitle: "Manage building access.",
    create: "Add user",
    edit: "Edit user",
    "dialogDescriptions.create": "Create an account.",
    "dialogDescriptions.edit": "Update this user.",
    created: "User created",
    updated: "User updated",
    deleted: "User deleted",
    blocked: "User blocked",
    unblocked: "User unblocked",
    you: "you",
    searchPlaceholder: "Search for a user…",
    notProvided: "Not provided",
    "filters.label": "Filter users by role",
    "filters.all": "All",
    "columns.user": "User",
    "columns.role": "Role",
    "columns.title": "Position",
    "columns.status": "Status",
    "columns.actions": "Actions",
    "statuses.active": "Active",
    "statuses.blocked": "Blocked",
    "statuses.passwordChangeRequired": "Setup required",
    "actions.open": "Open actions for {{name}}",
    "actions.block": "Block user",
    "actions.unblock": "Unblock user",
    "actions.delete": "Delete user",
    "roleSummary.title": "Roles",
    "roleSummary.descriptions.admin": "Configuration and users",
    "roleSummary.descriptions.operator": "Building operations",
    "roleSummary.descriptions.viewer": "Read-only access",
    "accountSummary.title": "Account status",
    "accountSummary.passwordChange": "Setup required",
    "empty.title": "No users yet",
    "empty.description": "Add a user.",
    "empty.noResults": "No matching users",
    "empty.noResultsDescription": "Try another search.",
    "validation.usernameRequired": "Enter a username.",
    "validation.passwordRequired": "Enter a password.",
    "validation.emailInvalid": "Enter a valid email address.",
    "roles.admin": "Admin",
    "roles.operator": "Operator",
    "roles.viewer": "Viewer",
    "fields.username": "Username",
    "fields.password": "Password",
    "fields.passwordOptional": "Password (optional)",
    "fields.passwordPlaceholder": "Leave blank",
    "fields.name": "Full name",
    "fields.email": "Email",
    "fields.title": "Title",
    "fields.role": "Role",
    "common:common.cancel": "Cancel",
    "common:common.create": "Create",
    "common:common.save": "Save",
  }),
);

const { mockBlock, mockCreate, mockDelete, mockList, mockUnblock, mockUpdate } =
  vi.hoisted(() => ({
    mockBlock: vi.fn(),
    mockCreate: vi.fn(),
    mockDelete: vi.fn(),
    mockList: vi.fn(),
    mockUnblock: vi.fn(),
    mockUpdate: vi.fn(),
  }));

let canWrite = true;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { id: "u1", permissions: ["users:read", "users:write"] },
    },
  }),
  usePermissions: () => (permission: string) =>
    permission === "users:write" ? canWrite : true,
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    users: {
      list: mockList,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      block: mockBlock,
      unblock: mockUnblock,
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import UsersPage from "./UsersPage";

const USERS: User[] = [
  {
    id: "u1",
    username: "alice",
    name: "Alice Martin",
    email: "alice@example.com",
    title: "Building manager",
    role: "admin",
  },
  {
    id: "u2",
    username: "bob",
    name: "Bob Bernard",
    email: "bob@example.com",
    title: "Operator",
    role: "operator",
  },
  {
    id: "u3",
    username: "cara",
    name: "Cara Chen",
    email: "cara@example.com",
    role: "viewer",
    is_blocked: true,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  canWrite = true;
  mockList.mockResolvedValue(USERS);
  mockCreate.mockResolvedValue(USERS[0]);
  mockUpdate.mockResolvedValue(USERS[0]);
  mockDelete.mockResolvedValue(undefined);
  mockBlock.mockResolvedValue(USERS[1]);
  mockUnblock.mockResolvedValue(USERS[2]);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("UsersPage", () => {
  it("renders users in a table with role and account summaries", async () => {
    renderPage();

    expect(await screen.findByText("Alice Martin")).toBeVisible();
    expect(screen.getByText("Bob Bernard")).toBeVisible();
    expect(screen.getByText("Cara Chen")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Roles" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Account status" }),
    ).toBeVisible();
    expect(screen.getByText("Building manager")).toBeVisible();
    expect(screen.getByText("(you)")).toBeVisible();
  });

  it("filters users by search text and role", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alice Martin");

    await user.type(screen.getByLabelText("Search for a user…"), "bob");
    expect(screen.getByText("Bob Bernard")).toBeVisible();
    expect(screen.queryByText("Alice Martin")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search for a user…"));
    await user.click(screen.getByRole("button", { name: "Viewer1" }));
    expect(screen.getByText("Cara Chen")).toBeVisible();
    expect(screen.queryByText("Bob Bernard")).not.toBeInTheDocument();
  });

  it("opens the selected user in the edit form", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Bob Bernard");

    await user.click(
      screen.getByRole("button", { name: "Open actions for Bob Bernard" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit user" }));

    expect(screen.getByRole("dialog", { name: "Edit user" })).toBeVisible();
    expect(screen.getByLabelText("Username")).toHaveValue("bob");
    expect(screen.getByLabelText("Full name")).toHaveValue("Bob Bernard");
  });

  it("submits the add-user form through the existing client", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alice Martin");

    await user.click(screen.getByRole("button", { name: "Add user" }));
    await user.type(screen.getByLabelText("Full name"), "Dina Diaz");
    await user.type(screen.getByLabelText("Username"), "dina");
    await user.type(screen.getByLabelText("Email"), "dina@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "viewer");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledWith({
      username: "dina",
      password: "secret",
      role: "viewer",
      name: "Dina Diaz",
      email: "dina@example.com",
      title: "",
    });
  });

  it("hides mutation controls from read-only users", async () => {
    canWrite = false;
    renderPage();

    expect(await screen.findByText("Alice Martin")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add user" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open actions for Bob Bernard",
      }),
    ).not.toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MeResponse } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "settings.subtitle": "My account",
    "settings.saved": "Profile saved",
    "settings.sections.profile.title": "Profile",
    "settings.sections.profile.description": "Your account details.",
    "settings.sections.security.title": "Security",
    "settings.sections.security.description": "Change your password.",
    "settings.mustChangePasswordTitle": "Password change required",
    "settings.mustChangePassword":
      "You're still using the default password. Set a new one.",
    "settings.updatePassword": "Update password",
    "settings.passwordUpdated": "Password updated",
    "settings.newPassword": "New password",
    "settings.newPasswordPlaceholder": "Enter a new password",
    "settings.confirmPassword": "Confirm new password",
    "settings.confirmPasswordPlaceholder": "Confirm your new password",
    "settings.passwordMismatch": "Passwords do not match",
    "settings.fields.username": "Username",
    "settings.fields.name": "Name",
    "settings.fields.email": "Email",
    "settings.fields.title": "Title",
    "settings.validation.usernameMinLength":
      "Username must be at least {{count}} characters.",
    "settings.validation.usernameMaxLength":
      "Username must be at most {{count}} characters.",
    "settings.validation.emailInvalid": "Enter a valid email address.",
    "settings.validation.passwordMinLength":
      "Password must be at least {{count}} characters.",
    "settings.validation.passwordMaxLength":
      "Password must be at most {{count}} characters.",
    "settings.validation.confirmPasswordRequired":
      "Please confirm your new password.",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.cancel": "Cancel",
    "common.error": "Error",
  }),
);

const { mockUpdateUser, mockRefreshMe } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
  mockRefreshMe: vi.fn(),
}));

let currentUser: MeResponse;

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: currentUser },
    refreshMe: mockRefreshMe,
  }),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    users: { update: (...args: unknown[]) => mockUpdateUser(...args) },
  }),
}));

vi.mock("@/lib/authSchema", () => ({
  getAuthSchema: vi.fn().mockResolvedValue({ properties: {} }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import SettingsPage from "./SettingsPage";

function makeUser(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: "u1",
    username: "alice",
    role: "operator",
    name: "Alice",
    email: "alice@example.com",
    title: "Operator",
    must_change_password: false,
    permissions: [],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  currentUser = makeUser();
  mockUpdateUser.mockResolvedValue(currentUser);
  mockRefreshMe.mockResolvedValue(currentUser);
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("SettingsPage", () => {
  it("renders Profile and Security as separate sections with their fields", () => {
    renderPage();

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();

    expect(screen.getByLabelText("Username")).toHaveValue("alice");
    expect(screen.getByLabelText("Email")).toHaveValue("alice@example.com");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  });

  it("hides the must-change-password warning when not required", () => {
    renderPage();

    expect(
      screen.queryByText("Password change required"),
    ).not.toBeInTheDocument();
  });

  it("shows a prominent must-change-password warning when required", () => {
    currentUser = makeUser({ must_change_password: true });
    renderPage();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Password change required");
    expect(alert).toHaveTextContent("You're still using the default password");
  });

  it("blocks the security submit when the confirmation does not match", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "newsecret");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Passwords do not match")).toBeVisible();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("saves profile fields without touching the password", async () => {
    const user = userEvent.setup();
    renderPage();

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Alice Cooper");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateUser.mock.calls[0];
    expect(payload).toMatchObject({ name: "Alice Cooper" });
    expect(payload).not.toHaveProperty("password");
  });

  it("submits only the password from the security form", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("New password"), "newsecret");
    await user.type(screen.getByLabelText("Confirm new password"), "newsecret");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    const [, payload] = mockUpdateUser.mock.calls[0];
    expect(payload).toEqual({ password: "newsecret" });
  });

  it("keeps the profile actions disabled until a field changes", async () => {
    const user = userEvent.setup();
    renderPage();

    const save = screen.getByRole("button", { name: "Save" });
    const profileForm = save.closest("form")!;
    const cancel = within(profileForm).getByRole("button", { name: "Cancel" });

    expect(save).toBeDisabled();
    expect(cancel).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "x");

    expect(save).toBeEnabled();
    expect(cancel).toBeEnabled();
  });

  it("resets the profile form when cancel is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    const nameInput = screen.getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Changed");

    const save = screen.getByRole("button", { name: "Save" });
    const profileForm = save.closest("form")!;
    await user.click(
      within(profileForm).getByRole("button", { name: "Cancel" }),
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Alice");
    expect(save).toBeDisabled();
  });

  it("keeps the security submit disabled until a password is entered", async () => {
    const user = userEvent.setup();
    renderPage();

    const submit = screen.getByRole("button", { name: "Update password" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("New password"), "x");

    expect(submit).toBeEnabled();
  });
});

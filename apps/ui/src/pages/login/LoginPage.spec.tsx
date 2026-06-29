import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/api/apiError";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "app.title": "Gridone",
    "app.subtitle": "Device control dashboard",
    "app.description": "Monitor real-time data.",
    "auth.login.username": "Username",
    "auth.login.password": "Password",
    "auth.login.signIn": "Sign in",
    "auth.login.signingIn": "Signing in...",
    "auth.login.error": "Login failed. Please try again.",
    "auth.login.unreachableTitle": "Server unreachable",
    "auth.login.unreachable":
      "Can't reach the server. Please try again in a moment.",
    "auth.login.retry": "Retry",
    "common.loading": "Loading...",
  }),
);

const { loginMock, navigateMock, getAuthSchemaMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  navigateMock: vi.fn(),
  getAuthSchemaMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ login: loginMock }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/api/authValidation", () => ({
  getAuthSchema: () => getAuthSchemaMock(),
}));

import LoginPage from "./LoginPage";

const VALID_SCHEMA = {
  type: "object",
  properties: {
    username: { type: "string" },
    password: { type: "string" },
  },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  loginMock.mockReset();
  navigateMock.mockReset();
  getAuthSchemaMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("LoginPage", () => {
  it("submits credentials and navigates home when the schema loads", async () => {
    const user = userEvent.setup();
    getAuthSchemaMock.mockResolvedValue(VALID_SCHEMA);
    loginMock.mockResolvedValue(undefined);
    renderPage();

    const submit = await screen.findByRole("button", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(submit);

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith("alice", "secret"),
    );
    expect(navigateMock).toHaveBeenCalledWith("/", { replace: true });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a distinct, non-alarming unreachable notice when the schema fails to load", async () => {
    getAuthSchemaMock.mockRejectedValue(new Error("network down"));
    renderPage();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Server unreachable");
    expect(notice).toHaveTextContent("Can't reach the server");
    // The unreachable notice is not the credentials/validation error surface.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not leave the sign-in button permanently disabled when the schema fails", async () => {
    getAuthSchemaMock.mockRejectedValue(new Error("network down"));
    renderPage();

    await screen.findByRole("status");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("recovers without a reload when retry succeeds", async () => {
    const user = userEvent.setup();
    getAuthSchemaMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(VALID_SCHEMA);
    renderPage();

    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(getAuthSchemaMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces credentials errors distinctly from the unreachable notice", async () => {
    const user = userEvent.setup();
    getAuthSchemaMock.mockResolvedValue(VALID_SCHEMA);
    loginMock.mockRejectedValue(new ApiError(401, "Unauthorized", "Bad creds"));
    renderPage();

    const submit = await screen.findByRole("button", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Bad creds");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports a transport failure as unreachable rather than a credentials error", async () => {
    const user = userEvent.setup();
    getAuthSchemaMock.mockResolvedValue(VALID_SCHEMA);
    loginMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();

    const submit = await screen.findByRole("button", { name: "Sign in" });
    await user.type(screen.getByLabelText("Username"), "alice");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(submit);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Can't reach the server");
  });
});

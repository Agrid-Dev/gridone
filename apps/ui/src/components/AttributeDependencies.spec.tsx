import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createI18nMock } from "@/test/i18nMock";
import { AttributeDependencies } from "./AttributeDependencies";

const { refreshAttribute } = vi.hoisted(() => ({ refreshAttribute: vi.fn() }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ devices: { refreshAttribute } }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "dependencies.refresh": "Refresh data",
    "dependencies.missing": "Missing data: {{names}}",
    "dependencies.failed": "Reading failed",
  }),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <AttributeDependencies
        deviceId="d1"
        attribute="target"
        labels={["Setpoint precision"]}
      />
    </QueryClientProvider>,
  );
  return invalidate;
}

describe("contextual dependency refresh", () => {
  it("names missing observations, shares the in-flight action and reloads server projections", async () => {
    let finish: (value: unknown) => void = () => {};
    refreshAttribute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const invalidate = setup();
    expect(
      screen.getByText("Missing data: Setpoint precision"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());
    fireEvent.click(screen.getByRole("button"));
    expect(refreshAttribute).toHaveBeenCalledTimes(1);
    expect(refreshAttribute).toHaveBeenCalledWith("d1", "target");
    finish({});
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["device", "d1"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["device-attributes"],
    });
  });
  it("reports a read failure and permits an explicit retry", async () => {
    refreshAttribute.mockRejectedValue(new Error("offline"));
    setup();
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reading failed",
    );
    expect(screen.getByRole("button")).toBeEnabled();
  });
});

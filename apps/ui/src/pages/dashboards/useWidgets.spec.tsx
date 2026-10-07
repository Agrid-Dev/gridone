import { Suspense, type ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useWidgetSchemas } from "./useWidgets";

const SCHEMAS = {
  text: { type: "object", "x-dashboard-types": ["history", "live"] },
  chart: { type: "object", "x-dashboard-types": ["history"] },
  synoptic: { type: "object", "x-dashboard-types": ["live"] },
};
let enabled = true;
vi.mock("@/utils/featureFlags", () => ({ useFeatureEnabled: () => enabled }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    dashboards: { getWidgetSchemas: async () => SCHEMAS },
  }),
}));
afterEach(cleanup);

it.each([true, false])(
  "only offers enabled widget types for creation (synoptics: %s)",
  async (flag) => {
    enabled = flag;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result } = renderHook(
      () => ({
        creation: useWidgetSchemas({ enabledOnly: true }),
        editing: useWidgetSchemas(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>
            <Suspense>{children}</Suspense>
          </QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current?.editing).toEqual(SCHEMAS));
    expect(result.current.creation).toEqual(
      flag ? SCHEMAS : { text: SCHEMAS.text, chart: SCHEMAS.chart },
    );
  },
);

it("only offers the widget types that fit the dashboard's type", async () => {
  enabled = true;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { result } = renderHook(
    () => ({
      live: useWidgetSchemas({ enabledOnly: true, dashboardType: "live" }),
      history: useWidgetSchemas({
        enabledOnly: true,
        dashboardType: "history",
      }),
      // A schema without the key (older backend) is never filtered out.
      editing: useWidgetSchemas(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <Suspense>{children}</Suspense>
        </QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(result.current?.editing).toEqual(SCHEMAS));
  expect(Object.keys(result.current.live)).toEqual(["text", "synoptic"]);
  expect(Object.keys(result.current.history)).toEqual(["text", "chart"]);
});

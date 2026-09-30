import { Suspense, type ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useWidgetSchemas } from "./useWidgets";

const SCHEMAS = { text: { type: "object" }, synoptic: { type: "object" } };
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
      flag ? SCHEMAS : { text: SCHEMAS.text },
    );
  },
);

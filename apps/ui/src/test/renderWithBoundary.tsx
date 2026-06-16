import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { ResourceBoundary } from "@/components/ResourceBoundary";

export interface RenderWithBoundaryOptions {
  /** History stack for the in-memory router (use to seed route params). */
  initialEntries?: string[];
  /** Route pattern the `ui` is mounted at (e.g. `":driverId"`). */
  path?: string;
  /** Reset keys forwarded to the boundary. */
  resetKeys?: unknown[];
  /** Suspense fallback forwarded to the boundary. */
  fallback?: ReactNode;
}

/**
 * Renders `ui` inside a `ResourceBoundary` with a fresh QueryClient (retries
 * off) and an in-memory router, so specs can assert the Suspense skeleton, the
 * not-found / error fallbacks, and reset-on-navigation in isolation.
 */
export function renderWithBoundary(
  ui: ReactNode,
  {
    initialEntries = ["/"],
    path = "*",
    resetKeys = ["resource"],
    fallback,
  }: RenderWithBoundaryOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path={path}
            element={
              <ResourceBoundary resetKeys={resetKeys} fallback={fallback}>
                {ui}
              </ResourceBoundary>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

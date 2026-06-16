import { ReactNode, Suspense } from "react";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { Skeleton } from "@/components/ui/skeleton";
import { isResourceNotFound } from "@/lib/errors";

/**
 * Maps a thrown error to the matching fallback page: a not-found error (missing
 * route param or `ApiError(404)`) renders `NotFoundFallback`, anything else
 * renders the generic `ErrorFallback`.
 */
function ResourceErrorFallback({ error }: FallbackProps) {
  return isResourceNotFound(error) ? <NotFoundFallback /> : <ErrorFallback />;
}

const DefaultSkeleton = (
  <section className="space-y-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64" />
  </section>
);

export interface ResourceBoundaryProps {
  children: ReactNode;
  /**
   * Reset the boundary when these values change — pass the route param(s) the
   * resource depends on (e.g. `[driverId]`). Mandatory in practice: without it
   * a captured error sticks across navigations to a sibling resource.
   */
  resetKeys: unknown[];
  /** Suspense loading fallback. Defaults to a generic page skeleton. */
  fallback?: ReactNode;
}

/**
 * Single seam for resource detail/edit routes: wraps `Suspense` (loading) and
 * `react-error-boundary` (error → fallback page) so page bodies can be pure
 * happy-path JSX driven by `useSuspenseQuery`.
 */
export function ResourceBoundary({
  children,
  resetKeys,
  fallback = DefaultSkeleton,
}: ResourceBoundaryProps) {
  return (
    <ErrorBoundary
      FallbackComponent={ResourceErrorFallback}
      resetKeys={resetKeys}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

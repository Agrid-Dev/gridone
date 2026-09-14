import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import type { Driver } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { useTranslation } from "react-i18next";

// The driver catalog is small and always fetched whole: the list page needs
// the unfiltered totals for its type chips and filters client-side.
export const useDrivers = () => {
  const client = useGridoneClient();
  const driversListQuery = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: () => client.drivers.list(),
    initialData: [],
  });
  return { driversListQuery };
};

/**
 * Fetches the driver named by the `:driverId` route param. Suspends while
 * loading and propagates an unknown driver as `GridoneError(404)` from the
 * backend (→ not-found fallback). The returned driver is therefore always
 * defined. A missing `:driverId` is a route-config bug, not a 404, so it
 * raises a plain error (→ generic error fallback).
 *
 * The query is seeded from any cached drivers list (the list view fetches them
 * all), so navigating from the list renders instantly; a direct page load has
 * no cache and hits the API.
 */
export const useDriverFromRoute = (): Driver => {
  const { driverId } = useParams<{ driverId: string }>();
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  if (!driverId) {
    throw new Error("useDriverFromRoute requires a 'driverId' route param");
  }
  // Look up the driver in any cached `["drivers", filters]` list.
  const cachedFromList = ():
    | { driver: Driver; updatedAt: number }
    | undefined => {
    for (const [key, drivers] of queryClient.getQueriesData<Driver[]>({
      queryKey: ["drivers"],
    })) {
      const driver = drivers?.find((d) => d.id === driverId);
      if (driver) {
        return {
          driver,
          updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
        };
      }
    }
    return undefined;
  };
  const { data } = useSuspenseQuery<Driver>({
    queryKey: ["driver", driverId],
    queryFn: () => client.drivers.get(driverId),
    initialData: () => cachedFromList()?.driver,
    initialDataUpdatedAt: () => cachedFromList()?.updatedAt,
  });
  return data;
};

export const useDeleteDriver = () => {
  const { t } = useTranslation(["drivers", "common"]);
  const navigate = useNavigate();
  const client = useGridoneClient();
  const deleteMutation = useMutation({
    mutationFn: (driverId: string) => client.drivers.delete(driverId),
    onSuccess: () => {
      toast.success(t("feedback.deleted"));
      navigate("..");
    },
    onError: (err: Error) => {
      const detail = serverErrorMessage(err);
      const base = t("common:errors.default");
      toast.error(detail ? `${base}: ${detail}` : base);
    },
  });
  const handleDelete = async (driverId: string) =>
    deleteMutation.mutateAsync(driverId);
  return { handleDelete };
};

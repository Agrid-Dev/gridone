import { getDrivers, getDriver, Driver, deleteDriver } from "@/api/drivers";
import { useQuery, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createDriver, DriverCreatePayload } from "@/api/drivers";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import { ResourceNotFoundError } from "@/lib/errors";
import { useTranslation } from "react-i18next";
import type { DevicesFilter } from "@/api/devices";

// Driver listing only filters by `types`; other DevicesFilter dimensions
// (ids, assetId, isFaulty) are accepted from the shared filter UI but
// ignored by the backend.
export const useDrivers = (filters?: DevicesFilter) => {
  const { t } = useTranslation(["drivers", "common"]);
  const navigate = useNavigate();
  const driversListQuery = useQuery<Driver[]>({
    queryKey: ["drivers", filters],
    queryFn: () => getDrivers(filters as Record<string, string> | undefined),
    initialData: [],
  });
  const handleApiError = (err: ApiError) => {
    const errorMessage = `${t("common:errors.default")}: ${err.details || err.message}`;
    toast.error(errorMessage);
  };
  const createMutation = useMutation({
    mutationFn: (payload: DriverCreatePayload) => createDriver(payload),
    onSuccess: async (result: Driver) => {
      await driversListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("feedback.created", { driverId: result.id }));
    },
    onError: handleApiError,
  });
  const handleCreate = async (payload: DriverCreatePayload) =>
    createMutation.mutateAsync(payload);
  return { driversListQuery, createMutation, handleCreate };
};

/**
 * Fetches the driver named by the `:driverId` route param. Suspends while
 * loading and throws to the nearest `ResourceBoundary`: `ResourceNotFoundError`
 * for a missing param, `ApiError(404)` (propagated from the backend) for an
 * unknown driver. The returned driver is therefore always defined.
 */
export const useDriverFromRoute = (): Driver => {
  const { driverId } = useParams<{ driverId: string }>();
  if (!driverId) {
    throw new ResourceNotFoundError("Missing 'driverId' route parameter");
  }
  const { data } = useSuspenseQuery<Driver>({
    queryKey: ["driver", driverId],
    queryFn: () => getDriver(driverId),
  });
  return data;
};

export const useDeleteDriver = () => {
  const { t } = useTranslation(["drivers", "common"]);
  const navigate = useNavigate();
  const deleteMutation = useMutation({
    mutationFn: (driverId: string) => deleteDriver(driverId),
    onSuccess: () => {
      toast.success(t("feedback.deleted"));
      navigate("..");
    },
    onError: (err: ApiError) => {
      toast.error(
        `${t("common:errors.default")}: ${err.details || err.message}`,
      );
    },
  });
  const handleDelete = async (driverId: string) =>
    deleteMutation.mutateAsync(driverId);
  return { handleDelete };
};

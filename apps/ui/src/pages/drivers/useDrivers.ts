import { getDrivers, Driver, deleteDriver } from "@/api/drivers";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createDriver, DriverCreatePayload } from "@/api/drivers";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import { useTranslation } from "react-i18next";

export const useDrivers = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const driversListQuery = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: getDrivers,
    initialData: [],
  });
  const handleApiError = (err: ApiError) => {
    const errorMessage = `${t("errors.default")}: ${err.details || err.message}`;
    toast.error(errorMessage);
  };
  const createMutation = useMutation({
    mutationFn: (payload: DriverCreatePayload) => createDriver(payload),
    onSuccess: async (result: Driver) => {
      await driversListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("drivers.feedback.created", { driverId: result.id }));
    },
    onError: handleApiError,
  });
  const handleCreate = async (payload: DriverCreatePayload) =>
    createMutation.mutateAsync(payload);
  const deleteMutation = useMutation({
    mutationFn: (driverId: string) => deleteDriver(driverId),
    onSuccess: () => {
      toast.success(t("drivers.feedback.deleted"));
      navigate("..");
    },
    onError: handleApiError,
  });
  const handleDelete = async (driverId: string) =>
    deleteMutation.mutateAsync(driverId);
  return { driversListQuery, createMutation, handleCreate, handleDelete };
};

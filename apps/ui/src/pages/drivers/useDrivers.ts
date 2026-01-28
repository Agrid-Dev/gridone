import { getDrivers, Driver } from "@/api/drivers";
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
  const createMutation = useMutation({
    mutationFn: (payload: DriverCreatePayload) => createDriver(payload),
    onSuccess: async (result: Driver) => {
      await driversListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("drivers.feedback.created", { driverId: result.id }));
    },
    onError: (err: ApiError) => {
      const errorMessage = `${t("errors.default")}: ${err.details || err.message}`;
      toast.error(errorMessage);
    },
  });
  const handleCreate = async (payload: DriverCreatePayload) =>
    createMutation.mutateAsync(payload);
  return { driversListQuery, createMutation, handleCreate };
};

import { getDrivers, Driver } from "@/api/drivers";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createDriver, DriverCreatePayload } from "@/api/drivers";
import { useNavigate } from "react-router";

export const useDrivers = () => {
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
    },
  });
  const handleCreate = async (payload: DriverCreatePayload) =>
    createMutation.mutateAsync(payload);
  return { driversListQuery, createMutation, handleCreate };
};

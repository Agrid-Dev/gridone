import { getDrivers, Driver } from "@/api/drivers";
import { useQuery } from "@tanstack/react-query";

export const useDrivers = () => {
  const driversListQuery = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: getDrivers,
    initialData: [],
  });
  return { driversListQuery };
};

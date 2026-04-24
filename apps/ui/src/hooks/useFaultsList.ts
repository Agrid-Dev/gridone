import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FaultView, listFaults } from "../api/faults";

export function useFaultsList() {
  const { t } = useTranslation("faults");

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<FaultView[]>({
    queryKey: ["faults"],
    queryFn: listFaults,
    refetchInterval: 10_000,
  });

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : t("faults.unableToLoad")
    : null;

  return {
    faults: data ?? [],
    loading: isLoading,
    error,
  };
}

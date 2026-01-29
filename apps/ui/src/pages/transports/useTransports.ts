import { listTransports, Transport, deleteTransport } from "@/api/transports";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createTransport, TransportCreatePayload } from "@/api/transports";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import { useTranslation } from "react-i18next";

export const useTransports = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const transportsListQuery = useQuery<Transport[]>({
    queryKey: ["transports"],
    queryFn: listTransports,
    initialData: [],
  });
  const handleApiError = (err: ApiError) => {
    const errorMessage = `${t("errors.default")}: ${err.details || err.message}`;
    toast.error(errorMessage);
  };
  const createMutation = useMutation({
    mutationFn: (payload: TransportCreatePayload) => createTransport(payload),
    onSuccess: async (result: Transport) => {
      await transportsListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("transports.feedback.created", { transportId: result.id }));
    },
    onError: handleApiError,
  });
  const handleCreate = async (payload: TransportCreatePayload) =>
    createMutation.mutateAsync(payload);
  const deleteMutation = useMutation({
    mutationFn: (transportId: string) => deleteTransport(transportId),
    onSuccess: () => {
      toast.success(t("transports.feedback.deleted"));
      navigate("..");
    },
    onError: handleApiError,
  });
  const handleDelete = async (transportId: string) =>
    deleteMutation.mutateAsync(transportId);
  return { transportsListQuery, createMutation, handleCreate, handleDelete };
};

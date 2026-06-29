import {
  listTransports,
  getTransport,
  Transport,
  deleteTransport,
} from "@/api/transports";
import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createTransport, TransportCreatePayload } from "@/api/transports";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import { useTranslation } from "react-i18next";

export const useTransports = () => {
  const { t } = useTranslation(["transports", "common"]);
  const navigate = useNavigate();
  const transportsListQuery = useQuery<Transport[]>({
    queryKey: ["transports"],
    queryFn: listTransports,
    initialData: [],
  });
  const handleApiError = (err: ApiError) => {
    const errorMessage = `${t("common:errors.default")}: ${err.details || err.message}`;
    toast.error(errorMessage);
  };
  const createMutation = useMutation({
    mutationFn: (payload: TransportCreatePayload) => createTransport(payload),
    onSuccess: async (result: Transport) => {
      await transportsListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("feedback.created", { transportId: result.id }));
    },
    onError: handleApiError,
  });
  const handleCreate = async (payload: TransportCreatePayload) =>
    createMutation.mutateAsync(payload);
  const deleteMutation = useMutation({
    mutationFn: (transportId: string) => deleteTransport(transportId),
    onSuccess: () => {
      toast.success(t("feedback.deleted"));
      navigate("..");
    },
    onError: handleApiError,
  });
  const handleDelete = async (transportId: string) =>
    deleteMutation.mutateAsync(transportId);
  return { transportsListQuery, createMutation, handleCreate, handleDelete };
};

export const useDeleteTransport = () => {
  const { t } = useTranslation(["transports", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (transportId: string) => deleteTransport(transportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      toast.success(t("feedback.deleted"));
      navigate("..");
    },
    onError: (err: ApiError) => {
      toast.error(
        `${t("common:errors.default")}: ${err.details || err.message}`,
      );
    },
  });
  const handleDelete = async (transportId: string) =>
    deleteMutation.mutateAsync(transportId);
  return { handleDelete, isDeleting: deleteMutation.isPending };
};

export const useTransportFromRoute = (): Transport => {
  const { transportId } = useParams<{ transportId: string }>();
  const queryClient = useQueryClient();
  if (!transportId) {
    throw new Error("useTransportFromRoute requires a 'transportId' param");
  }
  // Seed the detail query from any cached `["transports"]` list so navigating
  // from the list renders instantly while the fresh fetch resolves.
  const cachedFromList = ():
    | { transport: Transport; updatedAt: number }
    | undefined => {
    for (const [key, transports] of queryClient.getQueriesData<Transport[]>({
      queryKey: ["transports"],
    })) {
      const transport = transports?.find((item) => item.id === transportId);
      if (transport) {
        return {
          transport,
          updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
        };
      }
    }
    return undefined;
  };
  const { data } = useSuspenseQuery<Transport>({
    queryKey: ["transport", transportId],
    queryFn: () => getTransport(transportId),
    initialData: () => cachedFromList()?.transport,
    initialDataUpdatedAt: () => cachedFromList()?.updatedAt,
  });
  return data;
};

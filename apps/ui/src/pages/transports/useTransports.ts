import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import {
  isGridoneError,
  type Transport,
  type TransportCreate,
} from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export const useTransports = () => {
  const { t } = useTranslation(["transports", "common"]);
  const navigate = useNavigate();
  const client = useGridoneClient();
  const transportsListQuery = useQuery<Transport[]>({
    queryKey: ["transports"],
    queryFn: () => client.transports.list(),
    initialData: [],
  });
  const handleApiError = (err: Error) => {
    const detail = isGridoneError(err) ? err.detail : err.message;
    const errorMessage = `${t("common:errors.default")}: ${detail}`;
    toast.error(errorMessage);
  };
  const createMutation = useMutation({
    mutationFn: (payload: TransportCreate) => client.transports.create(payload),
    onSuccess: async (result: Transport) => {
      await transportsListQuery.refetch();
      navigate(`../${result.id}`);
      toast.success(t("feedback.created", { transportId: result.id }));
    },
    onError: handleApiError,
  });
  const handleCreate = async (payload: TransportCreate) =>
    createMutation.mutateAsync(payload);
  const deleteMutation = useMutation({
    mutationFn: (transportId: string) => client.transports.delete(transportId),
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
  const client = useGridoneClient();
  const deleteMutation = useMutation({
    mutationFn: (transportId: string) => client.transports.delete(transportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      toast.success(t("feedback.deleted"));
      navigate("..");
    },
    onError: (err: Error) => {
      const detail = isGridoneError(err) ? err.detail : err.message;
      toast.error(`${t("common:errors.default")}: ${detail}`);
    },
  });
  const handleDelete = async (transportId: string) =>
    deleteMutation.mutateAsync(transportId);
  return { handleDelete, isDeleting: deleteMutation.isPending };
};

export const useTransportFromRoute = (): Transport => {
  const { transportId } = useParams<{ transportId: string }>();
  const queryClient = useQueryClient();
  const client = useGridoneClient();
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
    queryFn: () => client.transports.get(transportId),
    initialData: () => cachedFromList()?.transport,
    initialDataUpdatedAt: () => cachedFromList()?.updatedAt,
  });
  return data;
};

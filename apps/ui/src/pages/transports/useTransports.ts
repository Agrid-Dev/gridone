import {
  useQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { type Transport, type TransportCreate } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

const toastApiError = (t: TFunction<["transports", "common"]>, err: Error) => {
  const detail = serverErrorMessage(err);
  const base = t("common:errors.default");
  toast.error(detail ? `${base}: ${detail}` : base);
};

export const useTransports = () => {
  const { t } = useTranslation(["transports", "common"]);
  const navigate = useNavigate();
  const client = useGridoneClient();
  const transportsListQuery = useQuery<Transport[]>({
    queryKey: ["transports"],
    queryFn: () => client.transports.list(),
    initialData: [],
  });
  const handleApiError = (err: Error) => toastApiError(t, err);
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
    onError: (err: Error) => toastApiError(t, err),
  });
  const handleDelete = async (transportId: string) =>
    deleteMutation.mutateAsync(transportId);
  return { handleDelete, isDeleting: deleteMutation.isPending };
};

export const useReconnectTransport = () => {
  const { t } = useTranslation(["transports", "common"]);
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const reconnectMutation = useMutation({
    mutationFn: (transportId: string) =>
      client.transports.reconnect(transportId),
    onSuccess: (result: Transport) => {
      queryClient.setQueryData(["transport", result.id], result);
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      toast.success(t("feedback.reconnected"));
    },
    onError: (err: Error) => toastApiError(t, err),
  });
  const handleReconnect = async (transportId: string) =>
    reconnectMutation.mutateAsync(transportId);
  return { handleReconnect, isReconnecting: reconnectMutation.isPending };
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

import { useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { DiscoveryHandler, Driver, Transport } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

export type DriverDiscoveryTransport = {
  transport: Transport;
  enabled: boolean;
  loading: boolean;
};

const discoveriesKey = (transportId: string) =>
  ["transports", transportId, "discoveries"] as const;

/**
 * Discovery registrations of `driver` on every network speaking its protocol.
 *
 * The API registers discovery per (transport, driver), so this fans out one
 * query per compatible transport. The query key is shared with the device
 * form's discovery switch so both views stay coherent.
 */
export function useDriverDiscovery(driver: Pick<Driver, "id" | "transport">) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation("drivers");

  const transportsQuery = useQuery<Transport[]>({
    queryKey: ["transports"],
    queryFn: () => client.transports.list(),
  });
  const compatible = useMemo(
    () =>
      (transportsQuery.data ?? []).filter(
        (transport) => transport.protocol === driver.transport,
      ),
    [transportsQuery.data, driver.transport],
  );

  const handlersQueries = useQueries({
    queries: compatible.map((transport) => ({
      queryKey: discoveriesKey(transport.id),
      queryFn: (): Promise<DiscoveryHandler[]> =>
        client.transports.listDiscoveryHandlers(transport.id),
    })),
  });

  const reportError = (error: unknown) => {
    const detail = serverErrorMessage(error);
    const base = t("discoverySection.updateError");
    toast.error(detail ? `${base}: ${detail}` : base);
  };
  const invalidate = (transportId: string) =>
    queryClient.invalidateQueries({ queryKey: discoveriesKey(transportId) });

  const enableMutation = useMutation({
    mutationFn: (transportId: string) =>
      client.transports.createDiscoveryHandler(transportId, {
        driver_id: driver.id,
      }),
    onSuccess: (_, transportId) => invalidate(transportId),
    onError: reportError,
  });
  const disableMutation = useMutation({
    mutationFn: (transportId: string) =>
      client.transports.deleteDiscoveryHandler(transportId, driver.id),
    onSuccess: (_, transportId) => invalidate(transportId),
    onError: reportError,
  });

  const isMutating = (transportId: string) =>
    (enableMutation.isPending && enableMutation.variables === transportId) ||
    (disableMutation.isPending && disableMutation.variables === transportId);

  const transports: DriverDiscoveryTransport[] = compatible.map(
    (transport, index) => ({
      transport,
      enabled:
        handlersQueries[index].data?.some(
          (handler) => handler.driver_id === driver.id && handler.enabled,
        ) ?? false,
      loading: handlersQueries[index].isLoading || isMutating(transport.id),
    }),
  );

  const setEnabled = (transportId: string, next: boolean) => {
    if (next) {
      enableMutation.mutate(transportId);
    } else {
      disableMutation.mutate(transportId);
    }
  };

  return {
    transports,
    setEnabled,
    loading: transportsQuery.isLoading,
    error: transportsQuery.isError,
  };
}

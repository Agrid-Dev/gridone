import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  createTransportDiscovery,
  deleteTransportDiscovery,
  listTransportDiscoveries,
  type DiscoveryHandler,
  type TransportProtocol,
} from "@/api/transports";
import { isApiError } from "@/api/apiError";

const MQTT_PROTOCOL: TransportProtocol = "mqtt";

export function protocolSupportsDiscovery(
  protocol: TransportProtocol | undefined,
): boolean {
  return protocol === MQTT_PROTOCOL;
}

export type UseDeviceDiscoveryOptions = {
  transportId: string | undefined;
  driverId: string | undefined;
  protocol: TransportProtocol | undefined;
  /**
   * When true, toggling does not call the API; the chosen state is held locally
   * until `flush()` is invoked. Use for the device-create flow where the
   * mutation should only run after the device itself is created.
   */
  deferred: boolean;
};

export function useDeviceDiscovery({
  transportId,
  driverId,
  protocol,
  deferred,
}: UseDeviceDiscoveryOptions) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("devices");
  const supported =
    protocolSupportsDiscovery(protocol) && !!transportId && !!driverId;

  const discoveryQueryKey = ["transports", transportId, "discoveries"] as const;

  const query = useQuery<DiscoveryHandler[]>({
    queryKey: discoveryQueryKey,
    queryFn: () => listTransportDiscoveries(transportId!),
    enabled: supported,
  });

  const serverEnabled =
    query.data?.some((h) => h.driverId === driverId && h.enabled) ?? false;

  const [intent, setIntent] = useState<boolean | null>(null);

  // Reset local intent whenever the target (transport, driver) pair changes —
  // the previous intent referred to a different handler key.
  useEffect(() => {
    setIntent(null);
  }, [transportId, driverId]);

  const enabled = intent ?? serverEnabled;

  const reportError = (error: unknown) => {
    const detail = isApiError(error)
      ? error.details || error.message
      : error instanceof Error
        ? error.message
        : null;
    const base = t("devices.fields.discoverDevicesLikeMeError");
    toast.error(detail ? `${base}: ${detail}` : base);
  };

  const startMutation = useMutation({
    mutationFn: ({
      transportId,
      driverId,
    }: {
      transportId: string;
      driverId: string;
    }) => createTransportDiscovery(transportId, driverId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: discoveryQueryKey }),
    onError: reportError,
  });

  const stopMutation = useMutation({
    mutationFn: ({
      transportId,
      driverId,
    }: {
      transportId: string;
      driverId: string;
    }) => deleteTransportDiscovery(transportId, driverId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: discoveryQueryKey }),
    onError: reportError,
  });

  const setEnabled = (next: boolean) => {
    if (!supported || !transportId || !driverId) return;
    if (deferred) {
      setIntent(next);
      return;
    }
    if (next) {
      startMutation.mutate({ transportId, driverId });
    } else {
      stopMutation.mutate({ transportId, driverId });
    }
  };

  /**
   * Commit any deferred change. Idempotent and safe to call when nothing
   * changed (resolves immediately). The caller passes the freshly created
   * device's `(transportId, driverId)` if they may differ from the hook's
   * inputs at flush time — typically they don't.
   */
  const flush = async (
    target:
      | { transportId: string; driverId: string }
      | undefined = transportId && driverId
      ? { transportId, driverId }
      : undefined,
  ) => {
    if (intent === null || !target) return;
    if (intent === serverEnabled) {
      setIntent(null);
      return;
    }
    if (intent) {
      await startMutation.mutateAsync(target);
    } else {
      await stopMutation.mutateAsync(target);
    }
    setIntent(null);
  };

  return {
    enabled,
    setEnabled,
    flush,
    supported,
    loading:
      query.isLoading || startMutation.isPending || stopMutation.isPending,
  };
}

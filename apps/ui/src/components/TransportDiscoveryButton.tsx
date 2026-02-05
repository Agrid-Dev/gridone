import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getDrivers, type Driver } from "@/api/drivers";
import { isApiError } from "@/api/apiError";
import {
  createTransportDiscovery,
  deleteTransportDiscovery,
  listTransportDiscoveries,
  type DiscoveryHandler,
  type Transport,
} from "@/api/transports";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type TransportDiscoveryButtonProps = {
  transport: Transport;
  className?: string;
};

type DiscoveryMutationContext = {
  previous?: DiscoveryHandler[];
};

export function TransportDiscoveryButton({
  transport,
  className,
}: TransportDiscoveryButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingDriverId, setPendingDriverId] = useState<string | null>(null);

  const discoveryQueryKey = useMemo(
    () => ["transports", transport.id, "discoveries"] as const,
    [transport.id],
  );

  const driversQuery = useQuery<Driver[]>({
    queryKey: ["drivers"],
    queryFn: getDrivers,
    initialData: [],
  });

  const discoveriesQuery = useQuery<DiscoveryHandler[]>({
    queryKey: discoveryQueryKey,
    queryFn: () => listTransportDiscoveries(transport.id),
    enabled: !!transport.id,
  });

  const eligibleDrivers = useMemo(() => {
    const drivers = driversQuery.data ?? [];
    const hasDiscoveryField = drivers.some(
      (driver) => typeof driver.discovery !== "undefined",
    );
    const filtered = hasDiscoveryField
      ? drivers.filter((driver) => Boolean(driver.discovery))
      : drivers;
    return filtered
      .filter((driver) => driver.transport === transport.protocol)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [driversQuery.data, transport.protocol]);

  const activeDriverIds = useMemo(
    () => new Set((discoveriesQuery.data ?? []).map((d) => d.driverId)),
    [discoveriesQuery.data],
  );

  const startDiscoveryMutation = useMutation<
    DiscoveryHandler,
    unknown,
    string,
    DiscoveryMutationContext
  >({
    mutationFn: (driverId: string) =>
      createTransportDiscovery(transport.id, driverId),
    onMutate: async (driverId) => {
      setPendingDriverId(driverId);
      await queryClient.cancelQueries({ queryKey: discoveryQueryKey });
      const previous = queryClient.getQueryData<DiscoveryHandler[]>(
        discoveryQueryKey,
      );
      const next = previous?.some((d) => d.driverId === driverId)
        ? previous
        : [
            ...(previous ?? []),
            { driverId, transportId: transport.id },
          ];
      queryClient.setQueryData(discoveryQueryKey, next);
      return { previous };
    },
    onError: (error, _driverId, context) => {
      const message = isApiError(error)
        ? `${t("errors.default")}: ${error.details || error.message}`
        : error instanceof Error
          ? error.message
          : t("transports.discovery.failed");
      toast.error(message);
      queryClient.setQueryData(discoveryQueryKey, context?.previous ?? []);
    },
    onSettled: () => {
      setPendingDriverId(null);
      queryClient.invalidateQueries({ queryKey: discoveryQueryKey });
    },
  });

  const stopDiscoveryMutation = useMutation<
    void,
    unknown,
    string,
    DiscoveryMutationContext
  >({
    mutationFn: (driverId: string) =>
      deleteTransportDiscovery(transport.id, driverId),
    onMutate: async (driverId) => {
      setPendingDriverId(driverId);
      await queryClient.cancelQueries({ queryKey: discoveryQueryKey });
      const previous = queryClient.getQueryData<DiscoveryHandler[]>(
        discoveryQueryKey,
      );
      const next = (previous ?? []).filter((d) => d.driverId !== driverId);
      queryClient.setQueryData(discoveryQueryKey, next);
      return { previous };
    },
    onError: (error, _driverId, context) => {
      const message = isApiError(error)
        ? `${t("errors.default")}: ${error.details || error.message}`
        : error instanceof Error
          ? error.message
          : t("transports.discovery.failed");
      toast.error(message);
      queryClient.setQueryData(discoveryQueryKey, context?.previous ?? []);
    },
    onSettled: () => {
      setPendingDriverId(null);
      queryClient.invalidateQueries({ queryKey: discoveryQueryKey });
    },
  });

  const isLoading = driversQuery.isLoading || discoveriesQuery.isLoading;
  const loadError = driversQuery.error ?? discoveriesQuery.error;
  const loadErrorMessage = loadError
    ? isApiError(loadError)
      ? loadError.details || loadError.message
      : loadError instanceof Error
        ? loadError.message
        : t("transports.discovery.loadError")
    : null;

  const handleToggle = (driverId: string, next: boolean) => {
    if (next) {
      startDiscoveryMutation.mutate(driverId);
      return;
    }
    stopDiscoveryMutation.mutate(driverId);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t("transports.discovery.title")}</CardTitle>
        <CardDescription>{t("transports.discovery.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : loadErrorMessage ? (
          <p className="text-sm text-destructive">{loadErrorMessage}</p>
        ) : eligibleDrivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("transports.discovery.noDriver")}
          </p>
        ) : (
          <div className="space-y-3">
            {eligibleDrivers.map((driver) => {
              const isActive = activeDriverIds.has(driver.id);
              const isPending =
                pendingDriverId === driver.id &&
                (startDiscoveryMutation.isPending ||
                  stopDiscoveryMutation.isPending);

              return (
                <div
                  key={driver.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {driver.id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isActive
                        ? t("transports.discovery.active")
                        : t("transports.discovery.inactive")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPending && (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    <Switch
                      checked={isActive}
                      onCheckedChange={(next) => handleToggle(driver.id, next)}
                      disabled={isPending}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

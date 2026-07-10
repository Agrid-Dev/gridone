import React, { FC, useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import type { Transport } from "@gridone/sdk";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useTransports } from "./useTransports";
import { TransportStatusBadge } from "./TransportStatusBadge";

const TransportCard: FC<{ transport: Transport; deviceCount: number }> = ({
  transport,
  deviceCount,
}) => {
  const { t } = useTranslation("transports");
  return (
    <Link to={transport.id} className="group block h-full no-underline">
      <Card className="card-glow flex h-full flex-col justify-between gap-2 p-4 transition-all duration-200 hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 truncate font-display text-base font-semibold text-card-foreground">
            {transport.name}
          </h2>
          <TransportStatusBadge state={transport.connection_state} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="info">
            {t(`protocols.${transport.protocol}`, {
              defaultValue: transport.protocol,
            })}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {t("device", { count: deviceCount })}
          </Badge>
        </div>
      </Card>
    </Link>
  );
};

const TransportsListContainer: FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t } = useTranslation("transports");
  const can = usePermissions();
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        actions={
          can("transports:write") ? (
            <Button asChild>
              <Link to="new">
                <Plus />
                {t("createAction")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {children}
    </section>
  );
};

const TransportsList: FC = () => {
  const { t } = useTranslation("transports");
  const { transportsListQuery } = useTransports();
  const { devices } = useDevicesList();

  const deviceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const device of devices) {
      counts.set(
        device.transport_id,
        (counts.get(device.transport_id) ?? 0) + 1,
      );
    }
    return counts;
  }, [devices]);

  if (transportsListQuery.isLoading) {
    return (
      <TransportsListContainer>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      </TransportsListContainer>
    );
  }

  const transports = transportsListQuery.data;

  return (
    <TransportsListContainer>
      {transports.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {transports.map((transport) => (
            <TransportCard
              key={transport.id}
              transport={transport}
              deviceCount={deviceCounts.get(transport.id) ?? 0}
            />
          ))}
        </div>
      ) : (
        <ResourceEmpty
          resourceName="network"
          showCreate={false}
          title={t("empty")}
        />
      )}
    </TransportsListContainer>
  );
};

export default TransportsList;

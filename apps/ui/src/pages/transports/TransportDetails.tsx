import { type FC, type ReactNode, useMemo } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Pencil, RefreshCw } from "lucide-react";
import type { Transport } from "@gridone/sdk";
import { Badge } from "@/components/ui/badge";
import { Button, Card } from "@/components/ui";
import { BackLink } from "@/components/BackLink";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { EmptyValue } from "@/components/EmptyValue";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { usePermissions } from "@/contexts/AuthContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { ConnectionStatus } from "@/lib/devices";
import { toLabel } from "@/lib/textFormat";
import {
  useDeleteTransport,
  useReconnectTransport,
  useTransportFromRoute,
} from "./useTransports";
import { TransportDevicesSection } from "./TransportDevicesSection";
import {
  presentTransportConfigValue,
  summarizeTransportDevices,
} from "./transportPresentation";

const PropertyRow: FC<{ label: ReactNode; value: ReactNode }> = ({
  label,
  value,
}) => (
  <div className="grid gap-1 py-3.5 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1fr)] sm:items-center sm:gap-6">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-sm font-medium text-foreground sm:text-right">
      {value ?? <EmptyValue />}
    </dd>
  </div>
);

const DetailsCard: FC<{ title: ReactNode; children: ReactNode }> = ({
  title,
  children,
}) => (
  <Card className="overflow-hidden rounded-xl">
    <div className="border-b px-5 py-4">
      <h2 className="font-display text-base font-semibold">{title}</h2>
    </div>
    <dl className="divide-y px-5">{children}</dl>
  </Card>
);

export const TransportDetails: FC<{
  transport: Transport;
  onDelete: (transportId: string) => Promise<void>;
  onReconnect: (transportId: string) => Promise<Transport>;
  isReconnecting: boolean;
}> = ({ transport, onDelete, onReconnect, isReconnecting }) => {
  const { t } = useTranslation(["transports", "common"]);
  const can = usePermissions();
  const deviceFilter = useMemo(
    () => ({ transport_id: transport.id }),
    [transport.id],
  );
  const { devices } = useDevicesList(deviceFilter);
  const driverIds = useMemo(
    () => summarizeTransportDevices(devices).get(transport.id)?.driverIds ?? [],
    [devices, transport.id],
  );
  const configEntries = Object.entries(transport.config);

  return (
    <div className="space-y-5">
      <BackLink to="..">{t("backToList")}</BackLink>

      <ResourceHeader
        title={transport.name}
        status={
          <div className="flex items-center gap-2">
            <Badge variant="info" className="text-[11px]">
              {t(`protocols.${transport.protocol}`, {
                defaultValue: transport.protocol,
              })}
            </Badge>
            <ConnectionStatusBadge
              status={transport.connection_state.status}
              label={t(`status.${transport.connection_state.status}`, {
                defaultValue: t("status.unknown"),
              })}
            />
          </div>
        }
        actions={
          can("transports:write") ? (
            <div className="flex items-center gap-2">
              {transport.connection_state.status === ConnectionStatus.Error ? (
                <Button
                  variant="outline"
                  disabled={isReconnecting}
                  onClick={() => onReconnect(transport.id)}
                >
                  <RefreshCw className="h-4 w-4" />
                  {isReconnecting
                    ? t("reconnectingAction")
                    : t("reconnectAction")}
                </Button>
              ) : null}
              <Button asChild variant="outline">
                <Link to="edit">
                  <Pencil className="h-4 w-4" />
                  {t("editAction")}
                </Link>
              </Button>
              <ResourceDeleteButton
                onDelete={() => onDelete(transport.id)}
                confirmTitle={t("deleteConfirmTitle")}
                confirmDetails={t("deleteConfirm", { name: transport.name })}
                deleteLabel={t("deleteAction")}
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.95fr)]">
        <div className="space-y-5">
          <DetailsCard title={t("sections.general")}>
            <PropertyRow label={t("fields.name")} value={transport.name} />
            <PropertyRow
              label={t("fields.drivers")}
              value={<DriverLinks driverIds={driverIds} />}
            />
            <PropertyRow
              label={t("fields.protocol")}
              value={
                <Badge variant="info" className="text-[11px]">
                  {t(`protocols.${transport.protocol}`, {
                    defaultValue: transport.protocol,
                  })}
                </Badge>
              }
            />
          </DetailsCard>

          <DetailsCard title={t("sections.connectionParameters")}>
            {configEntries.length > 0 ? (
              configEntries.map(([key, value]) => (
                <PropertyRow
                  key={key}
                  label={t(`configFields.${key}`, {
                    defaultValue: toLabel(key),
                  })}
                  value={
                    <span className="break-all text-xs">
                      {presentTransportConfigValue(key, value, (boolean) =>
                        t(`common:common.${boolean}`),
                      )}
                    </span>
                  }
                />
              ))
            ) : (
              <PropertyRow
                label={t("fields.configuration")}
                value={t("connection.noParameters")}
              />
            )}
          </DetailsCard>
        </div>

        <TransportDevicesSection transportId={transport.id} />
      </div>
    </div>
  );
};

function DriverLinks({ driverIds }: { driverIds: string[] }) {
  const { t } = useTranslation("transports");
  if (driverIds.length === 0) {
    return (
      <span className="text-muted-foreground">{t("fields.noDrivers")}</span>
    );
  }
  return (
    <span className="flex flex-wrap justify-start gap-x-2 gap-y-1 sm:justify-end">
      {driverIds.map((driverId) => (
        <Link
          key={driverId}
          to={`/drivers/${driverId}`}
          className="text-xs text-primary hover:underline"
        >
          {driverId}
        </Link>
      ))}
    </span>
  );
}

const TransportDetailsContent: FC = () => {
  const transport = useTransportFromRoute();
  const { handleDelete } = useDeleteTransport();
  const { handleReconnect, isReconnecting } = useReconnectTransport();
  return (
    <TransportDetails
      transport={transport}
      onDelete={handleDelete}
      onReconnect={handleReconnect}
      isReconnecting={isReconnecting}
    />
  );
};

const TransportDetailsWrapper: FC = () => {
  const { transportId } = useParams();
  return (
    <ResourceBoundary resetKeys={[transportId]}>
      <TransportDetailsContent />
    </ResourceBoundary>
  );
};

export default TransportDetailsWrapper;

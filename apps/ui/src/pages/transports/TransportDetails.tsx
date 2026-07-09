import { FC, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { Button, Card, CardContent } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { TypographyH3, TypographyP } from "@/components/ui/typography";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { usePermissions } from "@/contexts/AuthContext";
import { toLabel } from "@/lib/textFormat";
import type { Transport } from "@gridone/sdk";
import { useTransportFromRoute, useDeleteTransport } from "./useTransports";
import { TransportStatusBadge } from "./TransportStatusBadge";
import { TransportDevicesSection } from "./TransportDevicesSection";

const Property: FC<{ label: string; value: ReactNode }> = ({
  label,
  value,
}) => (
  <div>
    <Label>{label}</Label>
    <TypographyP>
      {value !== null && value !== undefined && value !== "" ? value : "N/A"}
    </TypographyP>
  </div>
);

const TransportDetails: FC<{
  transport: Transport;
  onDelete: (transportId: string) => Promise<void>;
}> = ({ transport, onDelete }) => {
  const { t } = useTranslation("transports");
  const can = usePermissions();
  useBreadcrumb([{ to: `/transports/${transport.id}`, label: transport.name }]);

  const configEntries = Object.entries(transport.config);

  return (
    <div className="space-y-6">
      <ResourceHeader
        title={transport.name}
        status={<TransportStatusBadge state={transport.connection_state} />}
        actions={
          can("transports:write") ? (
            <div className="flex items-center gap-2">
              <Button asChild>
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
      <Card className="py-4">
        <CardContent className="space-y-4">
          <div className="flex justify-start gap-16">
            <Property
              label={t("fields.protocol")}
              value={t(`protocols.${transport.protocol}`, {
                defaultValue: transport.protocol,
              })}
            />
          </div>
          <div>
            <TypographyH3>{t("fields.configuration")}</TypographyH3>
            <div className="mt-2 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {configEntries.length > 0 ? (
                configEntries.map(([key, value]) => (
                  <Property
                    key={key}
                    label={toLabel(key)}
                    value={String(value)}
                  />
                ))
              ) : (
                <TypographyP>N/A</TypographyP>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <TransportDevicesSection transportId={transport.id} />
    </div>
  );
};

const TransportDetailsContent: FC = () => {
  const transport = useTransportFromRoute();
  const { handleDelete } = useDeleteTransport();
  return <TransportDetails transport={transport} onDelete={handleDelete} />;
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

import { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import TransportForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { useTransportFromRoute } from "./useTransports";

const TransportEditContent: FC = () => {
  const { t } = useTranslation("transports");
  const navigate = useNavigate();
  const transport = useTransportFromRoute();
  useBreadcrumb([
    { to: `/transports/${transport.id}`, label: transport.name },
    {
      to: `/transports/${transport.id}/edit`,
      labelKey: "breadcrumb.edit",
    },
  ]);
  return (
    <section className="space-y-6">
      <ResourceHeader title={t("editTitle")} />
      <TransportForm
        transport={transport}
        onUpdated={() => {
          toast.success(t("updateSuccess"));
          navigate("..");
        }}
        onCancel={() => navigate("..")}
      />
    </section>
  );
};

const TransportEdit: FC = () => {
  const { transportId } = useParams();
  return (
    <ResourceBoundary resetKeys={[transportId]}>
      <TransportEditContent />
    </ResourceBoundary>
  );
};

export default TransportEdit;

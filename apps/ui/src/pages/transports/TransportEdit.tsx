import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteTransport,
  getTransport,
  type Transport,
} from "@/api/transports";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import TransportForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import TransportDiscoveryButton from "@/components/TransportDiscoveryButton";
import { usePermissions } from "@/contexts/AuthContext";

function TransportEdit() {
  const { t } = useTranslation();
  const { transport_id: transportId } = useParams<{ transport_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = usePermissions();

  const { data: transport, isLoading } = useQuery<Transport>({
    queryKey: ["transports", transportId],
    queryFn: () => getTransport(transportId ?? ""),
    enabled: !!transportId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransport(transportId ?? ""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      queryClient.removeQueries({ queryKey: ["transports", transportId] });
      navigate("/transports");
    },
  });

  if (!transportId) {
    return (
      <section className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>
            {t("transports.unableToLoadTitle", {
              defaultValue: t("common.error"),
            })}
          </AlertTitle>
          <AlertDescription>{t("transports.unableToLoad")}</AlertDescription>
        </Alert>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-72 w-full" />
      </section>
    );
  }

  if (!transport) {
    return null;
  }

  return (
    <>
      <TransportForm transport={transport} />
      <TransportDiscoveryButton transport={transport} />
      {can("transports:write") && (
        <DangerZone
          onDelete={() => deleteMutation.mutate()}
          isDeleting={deleteMutation.isPending}
          confirmTitle={t("transports.deleteAction")}
          confirmDetails={t("transports.deleteConfirm", {
            name: transport.name,
          })}
          deleteLabel={t("transports.deleteAction")}
        />
      )}
    </>
  );
}

export default function TransportEditWrapper() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("transports.title")}
        title={t("transports.editTitle")}
        resourceNameLinksBack
        backTo="/transports"
      />
      <TransportEdit />
    </section>
  );
}

import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getTransport, type Transport } from "@/api/transports";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import TransportForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { TransportDiscoveryButton } from "@/components/TransportDiscoveryButton";

function TransportEdit() {
  const { t } = useTranslation();
  const { transport_id: transportId } = useParams<{ transport_id: string }>();

  const { data: transport, isLoading } = useQuery<Transport>({
    queryKey: ["transports", transportId],
    queryFn: () => getTransport(transportId ?? ""),
    enabled: !!transportId,
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
      />
      <TransportEdit />
    </section>
  );
}

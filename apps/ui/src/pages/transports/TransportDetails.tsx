import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getTransport, type Transport } from "@/api/transports";
import { isNotFound } from "@/api/apiError";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, Card, CardContent, CardHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyEyebrow, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ResourceHeader } from "@/components/ResourceHeader";
import { usePermissions } from "@/contexts/AuthContext";

const statusStyles: Record<string, string> = {
  connected: "bg-green-100 text-green-700 border-green-200",
  connecting: "bg-orange-100 text-orange-700 border-orange-200",
  connection_error: "bg-red-100 text-red-700 border-red-200",
  idle: "bg-muted text-muted-foreground border-border",
  closing: "bg-muted text-muted-foreground border-border",
  closed: "bg-muted text-muted-foreground border-border",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default function TransportDetails() {
  const { t } = useTranslation();
  const { transport_id: transportId } = useParams<{ transport_id: string }>();
  const can = usePermissions();

  const {
    data: transport,
    isLoading,
    error,
  } = useQuery<Transport>({
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
        <Link
          to="/transports"
          className="inline-block text-sm font-medium text-foreground transition-colors hover:text-foreground"
        >
          {t("transports.backToList")}
        </Link>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </section>
    );
  }
  if (error && !isNotFound(error)) {
    return (
      <ErrorFallback
        title={t("errors.default")}
        message={t("errors.loadError", { transportId })}
      />
    );
  }

  if (!transport) {
    return (
      <NotFoundFallback
        title={t("errors.notFound")}
        message={t("transports.notFoundDetails", { transportId })}
      />
    );
  }

  const status = transport.connectionState?.status ?? "unknown";
  const statusLabel = t(`transports.status.${status}`, {
    defaultValue: status.replace(/_/g, " "),
  });

  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("transports.title")}
        title={transport.name || transport.id}
        actions={
          can("transports:write") ? (
            <Button variant="outline" asChild>
              <Link to={`/transports/${transportId}/edit`}>
                {t("transports.editAction")}
              </Link>
            </Button>
          ) : undefined
        }
        resourceNameLinksBack
        backTo="/transports"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
            statusStyles[status] ?? statusStyles.unknown,
          )}
        >
          {statusLabel}
        </span>
        <span className="text-muted-foreground">{transport.id}</span>
        <Link
          to="/transports"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("common.back")}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <TypographyEyebrow>
            {t("transports.fields.configuration")}
          </TypographyEyebrow>
          <TypographyP>{t("transports.fields.configurationHint")}</TypographyP>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(transport.config).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between border-b border-border pb-2 text-sm"
              >
                <span className="font-medium text-foreground">{key}</span>
                <span className="text-muted-foreground">{String(value)}</span>
              </div>
            ))}
            {Object.keys(transport.config).length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("common.noConfigurationData")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

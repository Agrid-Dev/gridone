import { useMemo } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, Card, CardContent, CardHeader } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypographyEyebrow,
  TypographyH2,
  TypographyH3,
  TypographyP,
} from "@/components/ui/typography";
import { listTransports, type Transport } from "@/api/transports";
import { cn } from "@/lib/utils";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";

const statusStyles: Record<string, string> = {
  connected: "bg-green-100 text-green-700 border-green-200",
  connecting: "bg-orange-100 text-orange-700 border-orange-200",
  connection_error: "bg-red-100 text-red-700 border-red-200",
  idle: "bg-slate-100 text-slate-600 border-slate-200",
  closing: "bg-slate-100 text-slate-600 border-slate-200",
  closed: "bg-slate-100 text-slate-600 border-slate-200",
  unknown: "bg-slate-100 text-slate-600 border-slate-200",
};

function TransportCard({ transport }: { transport: Transport }) {
  const { t } = useTranslation();
  const status = transport.connectionState?.status ?? "unknown";
  const statusLabel = t(`transports.status.${status}`, {
    defaultValue: status.replace(/_/g, " "),
  });
  const protocolLabel = t(`transports.protocols.${transport.protocol}`, {
    defaultValue: transport.protocol,
  });
  const configSummary = useMemo(() => {
    const entries = Object.entries(transport.config);
    if (!entries.length) {
      return t("common.noConfiguration");
    }
    return entries
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" / ");
  }, [transport.config, t]);

  return (
    <Link
      to={`/transports/${transport.id}`}
      className="block h-full no-underline"
    >
      <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <TypographyEyebrow>{protocolLabel}</TypographyEyebrow>
              <div className="mt-1 truncate">
                <TypographyH3>{transport.name}</TypographyH3>
              </div>
            </div>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
                statusStyles[status] ?? statusStyles.unknown,
              )}
            >
              {statusLabel}
            </span>
          </div>
          <TypographyP>{configSummary}</TypographyP>
        </CardHeader>
        <CardContent className="mt-auto">
          <p className="text-xs font-medium text-slate-500">
            {t("transports.editAction")}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function TransportsList() {
  const { t } = useTranslation();

  const {
    data: transports = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<Transport[]>({
    queryKey: ["transports"],
    queryFn: listTransports,
  });

  const listError = error
    ? error instanceof Error
      ? error.message
      : t("transports.unableToLoad")
    : null;

  const hasTransports = transports.length > 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <TypographyEyebrow>{t("transports.title")}</TypographyEyebrow>
          <div className="mt-1">
            <TypographyH2>{t("transports.subtitle")}</TypographyH2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
          >
            {isFetching ? t("common.refreshing") : t("common.refresh")}
          </Button>
          <Button asChild>
            <Link to="/transports/new">{t("transports.createAction")}</Link>
          </Button>
        </div>
      </div>

      {listError && (
        <Alert variant="destructive">
          <AlertTitle>
            {t("transports.unableToLoadTitle", {
              defaultValue: t("common.error"),
            })}
          </AlertTitle>
          <AlertDescription>{listError}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-full">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent className="mt-auto">
                <Skeleton className="h-3 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : hasTransports ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {transports.map((transport) => (
            <TransportCard key={transport.id} transport={transport} />
          ))}
        </div>
      ) : (
        <ResourceEmpty resourceName="transport" />
      )}
    </section>
  );
}

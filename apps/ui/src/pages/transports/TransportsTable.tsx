import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Network } from "lucide-react";
import type { Transport } from "@gridone/sdk";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TransportStatusBadge } from "./TransportStatusBadge";
import {
  transportEndpoint,
  type TransportDeviceSummary,
} from "./transportPresentation";

const Dash = () => <span className="text-muted-foreground">—</span>;

export function TransportsTable({
  transports,
  deviceSummaries,
}: {
  transports: Transport[];
  deviceSummaries: Map<string, TransportDeviceSummary>;
}) {
  const { t } = useTranslation("transports");

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <Th>{t("table.network")}</Th>
            <Th>{t("table.drivers")}</Th>
            <Th>{t("table.protocol")}</Th>
            <Th>{t("table.connection")}</Th>
            <Th className="text-right">{t("table.devices")}</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transports.map((transport) => (
            <TransportRow
              key={transport.id}
              transport={transport}
              summary={deviceSummaries.get(transport.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TransportRow({
  transport,
  summary,
}: {
  transport: Transport;
  summary?: TransportDeviceSummary;
}) {
  const { t } = useTranslation("transports");
  const navigate = useNavigate();
  const to = `/transports/${transport.id}`;
  const endpoint = transportEndpoint(transport);

  return (
    <TableRow onClick={() => navigate(to)} className="cursor-pointer">
      <TableCell className="py-3">
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Network className="h-4 w-4" aria-hidden />
          </span>
          <Link
            to={to}
            className="font-medium text-foreground hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {transport.name}
          </Link>
        </span>
      </TableCell>
      <TableCell className="py-3">
        <DriverLinks driverIds={summary?.driverIds ?? []} />
      </TableCell>
      <TableCell className="py-3">
        <Badge variant="info" className="font-mono text-[11px] font-medium">
          {t(`protocols.${transport.protocol}`, {
            defaultValue: transport.protocol,
          })}
        </Badge>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex min-w-44 items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {endpoint ?? t(`connection.${transport.protocol}`)}
          </span>
          <TransportStatusBadge state={transport.connection_state} compact />
        </div>
      </TableCell>
      <TableCell className="py-3 text-right font-medium tabular-nums">
        {summary?.count ?? 0}
      </TableCell>
    </TableRow>
  );
}

function DriverLinks({ driverIds }: { driverIds: string[] }) {
  if (driverIds.length === 0) return <Dash />;

  return (
    <span className="flex max-w-56 flex-wrap items-center gap-x-1 text-xs">
      {driverIds.slice(0, 2).map((driverId, index) => (
        <span key={driverId}>
          {index > 0 && <span className="text-muted-foreground">, </span>}
          <Link
            to={`/drivers/${driverId}`}
            className="font-mono font-medium text-muted-foreground hover:text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {driverId}
          </Link>
        </span>
      ))}
      {driverIds.length > 2 && (
        <span className="text-muted-foreground">+{driverIds.length - 2}</span>
      )}
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableHead
      className={cn("h-10 text-xs uppercase tracking-wider", className)}
    >
      {children}
    </TableHead>
  );
}

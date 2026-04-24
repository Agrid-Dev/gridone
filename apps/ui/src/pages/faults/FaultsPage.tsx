import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { SeverityChip } from "@/components/SeverityChip";
import { useFaultsList } from "@/hooks/useFaultsList";
import { faultLabel } from "@/lib/faultLabel";
import { formatTimeAgo } from "@/lib/utils";
import type { FaultView } from "@/api/faults";

function inferDataType(value: unknown): "str" | "int" | "bool" {
  if (typeof value === "number") return "int";
  if (typeof value === "boolean") return "bool";
  return "str";
}

/** Subsequence match: every char of `query` appears in `target` in order,
 *  gaps allowed. Case-insensitive. Empty query matches everything. */
function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  let cursor = 0;
  for (const ch of q) {
    const idx = t.indexOf(ch, cursor);
    if (idx === -1) return false;
    cursor = idx + 1;
  }
  return true;
}

export default function FaultsPage() {
  const { t } = useTranslation("faults");
  const { faults, loading, error } = useFaultsList();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return faults;
    return faults.filter(
      (f) => fuzzyMatch(f.deviceName, q) || fuzzyMatch(f.attributeName, q),
    );
  }, [faults, query]);

  const header = (
    <ResourceHeader
      title={t("faults.title")}
      resourceName={t("faults.subtitle")}
    />
  );

  if (loading) {
    return (
      <section className="space-y-6">
        {header}
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-6">
        {header}
        <ErrorFallback title={t("faults.unableToLoad")} />
      </section>
    );
  }

  const showEmpty = filtered.length === 0;
  const showNoMatch = showEmpty && faults.length > 0 && query.trim().length > 0;

  return (
    <section className="space-y-6">
      {header}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("faults.searchPlaceholder")}
          className="pl-9"
          aria-label={t("faults.searchPlaceholder")}
        />
      </div>

      {showEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert />
            </EmptyMedia>
            <EmptyTitle>
              {showNoMatch ? t("faults.noMatchTitle") : t("faults.emptyTitle")}
            </EmptyTitle>
            <EmptyDescription>
              {showNoMatch
                ? t("faults.noMatchDescription")
                : t("faults.emptyDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>{t("faults.columns.device")}</TableHead>
                <TableHead>{t("faults.columns.fault")}</TableHead>
                <TableHead>{t("faults.columns.severity")}</TableHead>
                <TableHead>{t("faults.columns.activeSince")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((fault) => (
                <FaultRow
                  key={`${fault.deviceId}:${fault.attributeName}`}
                  fault={fault}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function FaultRow({ fault }: { fault: FaultView }) {
  const { t } = useTranslation();
  const label = faultLabel({
    name: fault.attributeName,
    dataType: inferDataType(fault.currentValue),
    currentValue: fault.currentValue,
  });
  const activeSince = formatTimeAgo(new Date(fault.lastChanged).getTime(), t);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link to={`/devices/${fault.deviceId}`} className="hover:underline">
          {fault.deviceName}
        </Link>
      </TableCell>
      <TableCell>{label}</TableCell>
      <TableCell>
        <SeverityChip severity={fault.severity} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {activeSince}
      </TableCell>
    </TableRow>
  );
}

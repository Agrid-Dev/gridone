import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Synoptic } from "@gridone/sdk";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { useSynopticValues } from "@/hooks/useSynopticValues";
import { FaultsTable } from "@/pages/faults/components/FaultsTable";
import { useFaultsPage, type FaultRow } from "@/pages/faults/useFaultsPage";
import {
  readDefaultSynoptic,
  writeDefaultSynoptic,
  writeLastSynoptic,
} from "@/lib/synopticPreference";
import { PlateView } from "./PlateView";
import { SynopticStepper, SynopticSwitcher } from "./SynopticSwitcher";
import { useSynopticPage, useSynoptics } from "./useSynoptics";

/** The devices the plate's symbols are: what a click opens and what the
 *  fault list is scoped to. What a symbol reads is not what it is. */
const symbolDeviceIds = (doc: Synoptic): string[] => [
  ...new Set(
    (doc.symbols ?? []).flatMap((s) => (s.device_id ? [s.device_id] : [])),
  ),
];

/** The faults of the plate's own devices, under it. */
const SynopticFaults: FC<{
  rows: FaultRow[];
  loading: boolean;
  error: unknown;
}> = ({ rows, loading, error }) => {
  const { t } = useTranslation(["synoptics", "faults"]);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">
        {t("faults.title")}
      </h3>
      {loading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : error ? (
        <ErrorFallback title={t("faults:faults.unableToLoad")} />
      ) : rows.length > 0 ? (
        <FaultsTable rows={rows} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("faults.none")}</p>
      )}
    </section>
  );
};

const SynopticDetailContent: FC = () => {
  const { t } = useTranslation(["synoptics", "common"]);
  const navigate = useNavigate();
  const can = usePermissions();
  const { doc, knownSynoptics } = useSynopticPage();
  const synoptics = useSynoptics();
  const [pinned, setPinned] = useState(readDefaultSynoptic);
  const values = useSynopticValues(doc);
  const deviceIds = useMemo(() => symbolDeviceIds(doc), [doc]);
  const faults = useFaultsPage(deviceIds);

  // What `/synoptics` reopens when nothing is pinned.
  useEffect(() => writeLastSynoptic(doc.id), [doc.id]);

  const onNavigate = useCallback(
    (target: string) => navigate(`/synoptics/${encodeURIComponent(target)}`),
    [navigate],
  );
  const onPin = useCallback((id: string | null) => {
    writeDefaultSynoptic(id);
    setPinned(id);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <ResourceHeader
        title={
          <SynopticSwitcher
            current={doc}
            synoptics={synoptics}
            pinned={pinned}
            onNavigate={onNavigate}
          />
        }
        caption={doc.description}
        status={
          <>
            <SynopticStepper
              current={doc}
              synoptics={synoptics}
              pinned={pinned}
              onNavigate={onNavigate}
              onPin={onPin}
            />
            {!faults.loading && faults.rows.length > 0 && (
              <Badge variant="destructive" data-fault-count>
                {t("faults.count", { count: faults.rows.length })}
              </Badge>
            )}
          </>
        }
        actions={
          can("synoptics:write") && (
            <>
              <Button asChild variant="outline">
                <Link to={`/synoptics/${encodeURIComponent(doc.id)}/edit`}>
                  {t("common:common.edit")}
                </Link>
              </Button>
              <Button asChild>
                <Link to="/synoptics/new">{t("editor.new")}</Link>
              </Button>
            </>
          )
        }
      />
      <PlateView
        doc={doc}
        values={values}
        knownSynoptics={knownSynoptics}
        onNavigate={onNavigate}
      />
      <SynopticFaults
        rows={faults.rows}
        loading={faults.loading}
        error={faults.error}
      />
    </div>
  );
};

/** Keyed on the plate: a link to another plate lands with no popover
 *  open, since the device it showed belongs to the plate left behind. */
const SynopticDetail: FC = () => {
  const { synopticId } = useParams<{ synopticId: string }>();
  return (
    <ResourceBoundary resetKeys={[synopticId]}>
      <SynopticDetailContent key={synopticId} />
    </ResourceBoundary>
  );
};

export default SynopticDetail;

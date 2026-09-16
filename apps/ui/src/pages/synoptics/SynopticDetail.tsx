import { useCallback, useMemo, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Synoptic, SymbolElement } from "@gridone/sdk";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { SynopticRenderer } from "@/components/synoptic";
import { Skeleton } from "@/components/ui/skeleton";
import { useSynopticValues } from "@/hooks/useSynopticValues";
import { FaultsTable } from "@/pages/faults/components/FaultsTable";
import { useFaultsPage } from "@/pages/faults/useFaultsPage";
import { DevicePanel } from "./DevicePanel";
import { useSynopticPage } from "./useSynoptics";

/** The devices the plate's symbols are: what a click opens and what the
 *  fault list is scoped to. What a symbol reads is not what it is. */
const symbolDeviceIds = (doc: Synoptic): string[] => [
  ...new Set(
    (doc.symbols ?? []).flatMap((s) => (s.device_id ? [s.device_id] : [])),
  ),
];

/** The faults of the plate's own devices, under it. */
const SynopticFaults: FC<{ deviceIds: string[] }> = ({ deviceIds }) => {
  const { t } = useTranslation(["synoptics", "faults"]);
  const { rows, loading, error } = useFaultsPage(deviceIds);
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
  const navigate = useNavigate();
  const { doc, knownSynoptics } = useSynopticPage();
  const values = useSynopticValues(doc);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const deviceIds = useMemo(() => symbolDeviceIds(doc), [doc]);

  // The renderer only reports a device symbol or a link whose target exists.
  const onSymbolClick = useCallback(
    (symbol: SymbolElement) => {
      if (symbol.type === "link") {
        const target = String(symbol.props?.synoptic_id);
        navigate(`/synoptics/${encodeURIComponent(target)}`);
      } else if (symbol.device_id) {
        setDeviceId(symbol.device_id);
      }
    },
    [navigate],
  );

  return (
    <div className="flex flex-col gap-6">
      <ResourceHeader title={doc.name} caption={doc.description} />
      <div className="flex h-[40rem] gap-4">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
          <SynopticRenderer
            doc={doc}
            values={values}
            knownSynoptics={knownSynoptics}
            onSymbolClick={onSymbolClick}
          />
        </div>
        {deviceId && (
          <DevicePanel deviceId={deviceId} onClose={() => setDeviceId(null)} />
        )}
      </div>
      <SynopticFaults deviceIds={deviceIds} />
    </div>
  );
};

/** Keyed on the plate: a link to another plate lands with no panel open,
 *  since the device it showed belongs to the plate left behind. */
const SynopticDetail: FC = () => {
  const { synopticId } = useParams<{ synopticId: string }>();
  return (
    <ResourceBoundary resetKeys={[synopticId]}>
      <SynopticDetailContent key={synopticId} />
    </ResourceBoundary>
  );
};

export default SynopticDetail;

import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Synoptic, SynopticWidgetConfig } from "@gridone/sdk";
import { SynopticRenderer } from "@/components/synoptic";
import { DEFAULT_PROJECTION } from "@/components/synoptic/projection";
import { Skeleton } from "@/components/ui/skeleton";
import { useSynopticValues } from "@/hooks/useSynopticValues";
import { isResourceNotFound } from "@/lib/errors";
import { useSynopticById } from "@/pages/synoptics/useSynoptics";
import { usePlateVocabulary } from "@/pages/synoptics/usePlateVocabulary";
import { useFeatureEnabled } from "@/utils/featureFlags";

function SynopticMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** A still, fitted view: the page keeps the wheel and touch scroll, and
 *  symbols cannot navigate or open controls. */
function SynopticCanvas({
  doc,
  projection,
}: {
  doc: Synoptic;
  projection: SynopticWidgetConfig["projection"];
}) {
  const values = useSynopticValues(doc);
  // The widget draws the plate the way its author chose, plan or isometric:
  // a view of the document, never a change to it.
  const viewDoc = useMemo(
    () => ({ ...doc, projection: projection ?? DEFAULT_PROJECTION }),
    [doc, projection],
  );
  const vocabulary = usePlateVocabulary();

  return (
    <div className="relative h-full overflow-hidden">
      <SynopticRenderer
        doc={viewDoc}
        values={values}
        vocabulary={vocabulary}
        minTextPx={12}
        fixed
      />
    </div>
  );
}

/** The document shares the editor's cache; readings use the live device cache.
 *  The dashboard period does not apply to this live view. */
export function SynopticWidgetView({ config }: { config: unknown }) {
  const { synoptic_id: id, projection } = config as SynopticWidgetConfig;
  const { t } = useTranslation("dashboards");
  const enabled = useFeatureEnabled("synoptics");
  const { data, error, isPending } = useSynopticById(
    enabled ? id || undefined : undefined,
  );

  if (!enabled)
    return <SynopticMessage>{t("widgets.synoptic.disabled")}</SynopticMessage>;
  if (!id)
    return <SynopticMessage>{t("widgets.synoptic.empty")}</SynopticMessage>;
  if (error)
    return (
      <SynopticMessage>
        {t(
          isResourceNotFound(error)
            ? "widgets.synoptic.notFound"
            : "widgets.synoptic.error",
        )}
      </SynopticMessage>
    );
  if (isPending || !data) return <Skeleton className="h-full w-full" />;
  return <SynopticCanvas key={id} doc={data} projection={projection} />;
}

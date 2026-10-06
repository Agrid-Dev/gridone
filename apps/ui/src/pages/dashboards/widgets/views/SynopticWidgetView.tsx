import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Synoptic, SynopticWidgetConfig } from "@gridone/sdk";
import { DEFAULT_PROJECTION } from "@/components/synoptic/projection";
import { Skeleton } from "@/components/ui/skeleton";
import { useSynopticValues } from "@/hooks/useSynopticValues";
import { isResourceNotFound } from "@/lib/errors";
import { PlateView } from "@/pages/synoptics/PlateView";
import { useSynopticById } from "@/pages/synoptics/useSynoptics";
import { useFeatureEnabled } from "@/utils/featureFlags";

function SynopticMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** The plate with its toolbar and device popover, opening on the view the
 *  dashboard author chose; the page keeps the plain wheel. */
function SynopticCanvas({
  doc,
  projection,
}: {
  doc: Synoptic;
  projection: SynopticWidgetConfig["projection"];
}) {
  const values = useSynopticValues(doc);
  return (
    <PlateView
      className="h-full rounded-none border-0"
      doc={doc}
      values={values}
      defaultProjection={projection ?? DEFAULT_PROJECTION}
      embedded
    />
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
  // A new default view (the editor's preview) opens the plate on it.
  return (
    <SynopticCanvas
      key={`${id}:${projection}`}
      doc={data}
      projection={projection}
    />
  );
}

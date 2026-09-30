import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Scan, ZoomIn, ZoomOut } from "lucide-react";
import type { Synoptic, SynopticWidgetConfig } from "@gridone/sdk";
import { SynopticRenderer, type PlateHandle } from "@/components/synoptic";
import { ZOOM_STEP } from "@/components/synoptic/hooks/useViewport";
import { Button } from "@/components/ui/button";
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

/** Only viewing gestures are wired: symbols cannot navigate or open controls. */
function SynopticCanvas({ doc }: { doc: Synoptic }) {
  const { t } = useTranslation("synoptics");
  const values = useSynopticValues(doc);
  const vocabulary = usePlateVocabulary();
  const plate = useRef<PlateHandle | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="truncate text-sm font-medium">{doc.name}</span>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("view.zoomOut")}
            onClick={() => plate.current?.zoomBy(1 / ZOOM_STEP)}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("view.zoomIn")}
            onClick={() => plate.current?.zoomBy(ZOOM_STEP)}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("view.fit")}
            onClick={() => plate.current?.fit()}
          >
            <Scan className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <SynopticRenderer
          doc={doc}
          values={values}
          vocabulary={vocabulary}
          plateRef={plate}
          minTextPx={12}
          touchAction="pan-y"
        />
      </div>
    </div>
  );
}

/** The document shares the editor's cache; readings use the live device cache.
 *  The dashboard period does not apply to this live view. */
export function SynopticWidgetView({ config }: { config: unknown }) {
  const { synoptic_id: id } = config as SynopticWidgetConfig;
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
  return <SynopticCanvas key={id} doc={data} />;
}

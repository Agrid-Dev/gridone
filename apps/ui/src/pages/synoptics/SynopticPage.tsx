import type { FC, ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { Synoptic, SynopticSummary } from "@gridone/sdk";
import type { SynopticValues } from "@/components/synoptic/values";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FaultsTable } from "@/pages/faults/components/FaultsTable";
import type { FaultRow } from "@/pages/faults/useFaultsPage";
import { PlateView } from "./PlateView";
import { SynopticStepper, SynopticSwitcher } from "./SynopticSwitcher";

/** A section under the plate, headed like the rest of the app's. */
const Section: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <section className="space-y-3">
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {children}
  </section>
);

type Faults = { rows: FaultRow[]; loading: boolean; error: unknown };

type SynopticPageProps = {
  doc: Synoptic;
  values: SynopticValues;
  /** The plates that exist, for the links on this one. */
  knownSynoptics: ReadonlySet<string>;
  /** Every stored plate, in list order, for the title's menu and steps. */
  synoptics: SynopticSummary[];
  /** The plate `/synoptics` opens on, if one is pinned. */
  pinned: string | null;
  onPin: (id: string | null) => void;
  onNavigate: (synopticId: string) => void;
  /** The active faults of the plate's own devices. */
  faults: Faults;
  /** The user may edit and create plates. */
  canWrite: boolean;
};

/**
 * A plate's page, in the order it is read: the drawing with the list that
 * locates an equipment on it, which takes the rest of the first screen;
 * the faults of its devices; the description last. The data comes
 * from the route (`SynopticDetail`), so the page renders the same anywhere
 * it is given a plate.
 */
export const SynopticPage: FC<SynopticPageProps> = ({
  doc,
  values,
  knownSynoptics,
  synoptics,
  pinned,
  onPin,
  onNavigate,
  faults,
  canWrite,
}) => {
  const { t } = useTranslation(["synoptics", "common", "faults"]);

  return (
    <div className="flex flex-col gap-6">
      {/* The first screen: the header and the plate, which takes whatever
          the header leaves under the app's top bar (4rem) and the page's
          own padding (2rem above and below). The card draws the divider,
          so the header sits flush above it. */}
      <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col gap-4">
        <ResourceHeader
          flush
          title={
            <SynopticSwitcher
              current={doc}
              synoptics={synoptics}
              pinned={pinned}
              onNavigate={onNavigate}
            />
          }
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
            canWrite && (
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
          className="min-h-0 flex-1"
          doc={doc}
          values={values}
          knownSynoptics={knownSynoptics}
          onNavigate={onNavigate}
        />
      </div>
      <Section title={t("faults.title")}>
        {faults.loading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : faults.error ? (
          <ErrorFallback title={t("faults:faults.unableToLoad")} />
        ) : faults.rows.length > 0 ? (
          <FaultsTable rows={faults.rows} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("faults.none")}</p>
        )}
      </Section>
      {doc.description && (
        <Section title={t("description.title")}>
          <p
            data-plate-description
            className="max-w-3xl whitespace-pre-line text-sm text-muted-foreground"
          >
            {doc.description}
          </p>
        </Section>
      )}
    </div>
  );
};

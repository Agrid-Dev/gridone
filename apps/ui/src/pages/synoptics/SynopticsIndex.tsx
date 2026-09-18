import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useSynoptics } from "./useSynoptics";

/** `/synoptics`: one card per stored plate. Plates are authored by
 *  operators through the API, so the empty state offers no creation. */
const SynopticsIndexContent: FC = () => {
  const { t } = useTranslation("synoptics");
  const synoptics = useSynoptics();

  if (synoptics.length === 0) {
    return (
      <ResourceEmpty
        resourceName={t("resourceName")}
        showCreate={false}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {synoptics.map((synoptic) => (
        <li key={synoptic.id}>
          <Link
            to={`/synoptics/${synoptic.id}`}
            className="block h-full rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
          >
            <h3 className="text-sm font-semibold text-foreground">
              {synoptic.name}
            </h3>
            {synoptic.description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {synoptic.description}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
};

const SynopticsIndex: FC = () => {
  const { t } = useTranslation("synoptics");
  return (
    <section className="space-y-6">
      <ResourceHeader title={t("title")} caption={t("caption")} />
      <ResourceBoundary resetKeys={[]}>
        <SynopticsIndexContent />
      </ResourceBoundary>
    </section>
  );
};

export default SynopticsIndex;

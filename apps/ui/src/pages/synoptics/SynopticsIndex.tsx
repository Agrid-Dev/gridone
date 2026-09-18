import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/contexts/AuthContext";
import { useSynoptics } from "./useSynoptics";

/** `/synoptics`: one card per stored plate. Creation is the editor's,
 *  offered in the header to those who may write. */
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
  const can = usePermissions();
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("caption")}
        actions={
          can("synoptics:write") && (
            <Button asChild>
              <Link to="/synoptics/new">{t("editor.new")}</Link>
            </Button>
          )
        }
      />
      <ResourceBoundary resetKeys={[]}>
        <SynopticsIndexContent />
      </ResourceBoundary>
    </section>
  );
};

export default SynopticsIndex;

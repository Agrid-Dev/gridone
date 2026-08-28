import type { FC } from "react";
import { useTranslation } from "react-i18next";

/**
 * Stands in for a meter tree editor, which does not exist yet.
 *
 * The config is a recursive tree, which the shared schema-driven form cannot
 * render — its dialect is deliberately flat — so authoring one needs a bespoke
 * editor. Until that exists, a tree is created through the API and this says so
 * rather than leaving the form mysteriously blank and unsubmittable.
 *
 * No fields are registered, so `config.root` never becomes valid and the form's
 * submit stays disabled. That is the intended behaviour in both directions: it
 * also stops an existing tree being opened and silently flattened by a UI that
 * cannot represent it.
 */
export const MeterTreeConfigPlaceholder: FC = () => {
  const { t } = useTranslation("dashboards");
  return (
    <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      {t("widgets.meterTree.apiOnly")}
    </p>
  );
};

import type { FC } from "react";
import { useTranslation } from "react-i18next";

/**
 * Placeholder for the Dashboards section. Step 1 (AGR-874) only wires the
 * flag-gated nav entry and routes; navigation/tabs and CRUD land in the next
 * steps, and widgets in a later milestone.
 */
const DashboardsPage: FC = () => {
  const { t } = useTranslation("dashboards");

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        {t("placeholder.heading")}
      </h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        {t("placeholder.body")}
      </p>
    </div>
  );
};

export default DashboardsPage;

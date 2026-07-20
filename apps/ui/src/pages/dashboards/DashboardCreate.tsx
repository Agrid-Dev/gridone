import type { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DashboardForm } from "./DashboardForm";
import { useCreateDashboard } from "./useDashboards";

/** `/dashboards/new`: create a dashboard, then land on it. */
const DashboardCreate: FC = () => {
  const { t } = useTranslation("dashboards");
  const navigate = useNavigate();
  const { createDashboard } = useCreateDashboard();

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("create.title")} />
      <DashboardForm
        formId="dashboard-create-form"
        submitLabel={t("create.submit")}
        onSubmit={async (values) => {
          const created = await createDashboard(values).catch(() => null);
          if (created) {
            navigate(`../${created.id}`);
          }
        }}
        onCancel={() => navigate("..")}
      />
    </section>
  );
};

export default DashboardCreate;

import type { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DashboardForm } from "./DashboardForm";
import { useCreateDashboard } from "./useDashboards";

/** `/dashboards/new`: create a dashboard, then land on it. */
const DashboardCreate: FC = () => {
  const { t } = useTranslation("dashboards");
  const navigate = useNavigate();
  const { createDashboard } = useCreateDashboard();

  useBreadcrumb([{ to: "/dashboards/new", labelKey: "breadcrumb.new" }]);

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("create.title")} />
      <DashboardForm
        formId="dashboard-create-form"
        submitLabel={t("create.submit")}
        onSubmit={async (values) => {
          try {
            const created = await createDashboard(values);
            navigate(`../${created.id}`);
          } catch {
            /* handled by the mutation's onError */
          }
        }}
        onCancel={() => navigate("..")}
      />
    </section>
  );
};

export default DashboardCreate;

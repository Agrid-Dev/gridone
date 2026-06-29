import { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import TransportForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";

const TransportCreate: FC = () => {
  const { t } = useTranslation("transports");
  const navigate = useNavigate();
  useBreadcrumb([{ to: "/transports/new", labelKey: "breadcrumb.new" }]);
  return (
    <section className="space-y-6">
      <ResourceHeader title={t("createTitle")} />
      <TransportForm
        onCreated={(transport) => {
          toast.success(t("createSuccess"));
          navigate(`../${transport.id}`);
        }}
        onCancel={() => navigate("..")}
      />
    </section>
  );
};

export default TransportCreate;

import { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import TransportForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";

const TransportCreate: FC = () => {
  const { t } = useTranslation("transports");
  const navigate = useNavigate();
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

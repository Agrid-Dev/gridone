import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import TransportForm from "./form";

export default function TransportCreate() {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("transports.title")}
        title={t("transports.createTitle")}
        resourceNameLinksBack
      />
      <TransportForm />
    </section>
  );
}

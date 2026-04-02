import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import TransportForm from "./form";

export default function TransportCreate() {
  const { t } = useTranslation("transports");

  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("title")}
        title={t("createTitle")}
        resourceNameLinksBack
        backTo="/transports"
      />
      <TransportForm />
    </section>
  );
}

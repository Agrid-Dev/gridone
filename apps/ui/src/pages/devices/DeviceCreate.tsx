import DeviceForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useTranslation } from "react-i18next";

export default function DeviceCreate() {
  const { t } = useTranslation();
  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("devices.title")}
        title={t("devices.create.title")}
        resourceNameLinksBack
      />
      <DeviceForm />
    </section>
  );
}

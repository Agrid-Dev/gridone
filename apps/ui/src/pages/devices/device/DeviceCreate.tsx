import DeviceForm from "./form";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { useTranslation } from "react-i18next";

export default function DeviceCreate() {
  const { t } = useTranslation("devices");
  useBreadcrumb([{ to: "/devices/new", labelKey: "breadcrumb.new" }]);
  return (
    <section className="space-y-6">
      <ResourceHeader title={t("devices.create.title")} />
      <DeviceForm />
    </section>
  );
}

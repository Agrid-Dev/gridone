import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import TransportForm from "./form";

export default function TransportCreate() {
  const { t } = useTranslation();

  return (
    <section className="space-y-6">
      <Link
        to="/transports"
        className="inline-block text-sm font-medium text-slate-700 transition-colors hover:text-slate-900"
      >
        {t("common.back")}
      </Link>

      <TransportForm />
    </section>
  );
}

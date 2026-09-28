import { ShieldX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Fallback } from "./Fallback";

export function ForbiddenFallback() {
  const { t } = useTranslation("common");
  return (
    <Fallback
      title={t("errors.forbidden")}
      message={t("errors.forbiddenDescription")}
      icon={<ShieldX size="3rem" />}
    />
  );
}

import { Fallback, FallbackProps } from "./Fallback";
import { FC } from "react";
import { CircleX } from "lucide-react";
import { useTranslation } from "react-i18next";
type ErrorFallbackProps = Partial<Omit<FallbackProps, "icon">>;

export const ErrorFallback: FC<ErrorFallbackProps> = (props) => {
  const { t } = useTranslation();
  const title = props.title || t("common.errors.default");
  return <Fallback {...props} title={title} icon={<CircleX size="3rem" />} />;
};

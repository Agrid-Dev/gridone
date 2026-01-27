import { Fallback, FallbackProps } from "./Fallback";
import { FC } from "react";
import { CircleX } from "lucide-react";

export const ErrorFallback: FC<Omit<FallbackProps, "icon">> = (props) => (
  <Fallback {...props} icon={<CircleX size="3rem" />} />
);

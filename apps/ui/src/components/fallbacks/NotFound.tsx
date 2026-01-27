import { Fallback, FallbackProps } from "./Fallback";
import { FC } from "react";
import { FileSearchCorner } from "lucide-react";

export const NotFoundFallback: FC<Omit<FallbackProps, "icon">> = (props) => (
  <Fallback {...props} icon={<FileSearchCorner size="3rem" />} />
);

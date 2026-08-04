import { FC, ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

/** Right-aligned card-header action of the building page: "label →" linking
 *  to the resource's full page. */
export const CardHeaderLink: FC<{ to: string; children: ReactNode }> = ({
  to,
  children,
}) => (
  <Link
    to={to}
    className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
  >
    {children}
    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
  </Link>
);

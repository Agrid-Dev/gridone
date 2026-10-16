import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  /** Route search strings of the neighbouring pages, from the API's
   *  pagination links (`toSearchString`); undefined when there is none. */
  prevHref: string | undefined;
  nextHref: string | undefined;
};

/** Previous · "page / pages" · next, for a list the API serves by pages.
 *  Renders nothing when everything fits on one page. */
export function PaginationControls({
  page,
  totalPages,
  prevHref,
  nextHref,
}: PaginationControlsProps) {
  const { t } = useTranslation("common");
  if (totalPages <= 1) return null;

  return (
    <nav
      className="flex items-center justify-between"
      aria-label={t("pagination.label")}
    >
      <PageLink href={prevHref} label={t("pagination.previous")}>
        <ChevronLeft className="h-4 w-4" />
      </PageLink>
      <span className="text-sm text-muted-foreground">
        {page} / {totalPages}
      </span>
      <PageLink href={nextHref} label={t("pagination.next")}>
        <ChevronRight className="h-4 w-4" />
      </PageLink>
    </nav>
  );
}

const linkClasses = cn(
  buttonVariants({ variant: "outline", size: "icon" }),
  "h-8 w-8",
);

function PageLink({
  href,
  label,
  children,
}: {
  href: string | undefined;
  label: string;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <span
        className={cn(linkClasses, "pointer-events-none opacity-50")}
        aria-disabled
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      to={{ search: href }}
      className={linkClasses}
      aria-label={label}
      replace
    >
      {children}
    </Link>
  );
}

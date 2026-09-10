import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import type { SectionNode } from "../document";
import { localize } from "../face";
import { sectionCounts } from "../sectionCounts";

/** Native disclosures keep nested open states and keyboard support across live updates. */
export function PresentationSection({
  node,
  language,
  children,
}: {
  node: SectionNode;
  language: string;
  children: ReactNode;
}) {
  const Container = node.appearance === "plain" ? "section" : Card;
  const heading = (
    <>
      <h3 className="min-w-0 text-base font-semibold tracking-tight">
        {localize(node.title, language)}
      </h3>
      {node.show_count && <SectionCount node={node} />}
    </>
  );
  const content = (
    <div className="space-y-4 pt-4">
      {node.description && (
        <p className="text-sm text-muted-foreground">
          {localize(node.description, language)}
        </p>
      )}
      {children}
    </div>
  );
  return (
    <Container
      data-node="section"
      data-appearance={node.appearance ?? "card"}
      className={node.appearance === "plain" ? "border-t pt-4" : "p-6"}
    >
      {node.collapsible ? (
        <details
          open={!node.collapsed}
          className="[&[open]>summary>svg]:rotate-90"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            {heading}
          </summary>
          {content}
        </details>
      ) : (
        <>
          <div className="flex items-center gap-3">{heading}</div>
          {content}
        </>
      )}
    </Container>
  );
}

function SectionCount({ node }: { node: SectionNode }) {
  const { t } = useTranslation("devices");
  const { controls, measurements } = sectionCounts(node);
  const key =
    measurements === 0
      ? "presentation.sectionSettings"
      : controls === 0
        ? "presentation.sectionValues"
        : "presentation.sectionItems";
  return (
    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
      {t(key, { count: controls + measurements })}
    </span>
  );
}

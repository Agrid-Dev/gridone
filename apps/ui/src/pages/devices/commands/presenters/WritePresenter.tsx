import { ArrowRight } from "lucide-react";
import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import type { AttributeWrite } from "@/api/commands";

type WritePresenterProps = {
  write: AttributeWrite;
  className?: string;
};

/** Compact inline summary of an ``AttributeWrite``: "attribute → value". Used
 *  anywhere a template or batch's payload appears. */
export function WritePresenter({ write, className }: WritePresenterProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-sm ${className ?? ""}`}
    >
      <span className="font-medium">{toLabel(write.attribute)}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-mono tabular-nums">
        {formatValue(write.value, write.dataType)}
      </span>
    </span>
  );
}

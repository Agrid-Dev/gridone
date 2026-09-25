import { useTranslation } from "react-i18next";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePlateVocabulary } from "../usePlateVocabulary";
import type { Check } from "./checks";
import { pipeName, symbolName } from "./names";
import type { SynopticEditorState } from "./useSynopticEditor";

/**
 * What to look at before saving, errors first, each with a way to the
 * element it is about: "Associer" opens a symbol without a device, "Voir"
 * any other. None of it stops a save.
 */
export function ChecksList({
  editor,
  onPick,
}: {
  editor: SynopticEditorState;
  /** Called once an entry has selected its element, to close the list. */
  onPick?: () => void;
}) {
  const { t } = useTranslation("synoptics");
  const vocabulary = usePlateVocabulary();
  const { doc, checks } = editor;

  const target = (check: Check) => {
    if (!check.element) return null;
    const symbol = doc.symbols?.find((s) => s.id === check.element);
    if (symbol) {
      return {
        name: symbolName(symbol, vocabulary.typeLabel),
        selection: { kind: "symbol" as const, id: symbol.id },
      };
    }
    const pipe = doc.pipes?.find((p) => p.id === check.element);
    if (pipe) {
      return {
        name: pipeName(pipe, (f) => t(`fluids.${f}`)),
        selection: { kind: "pipe" as const, id: pipe.id },
      };
    }
    return { name: check.element, selection: null };
  };
  const message = (check: Check) =>
    check.kind === "saved"
      ? check.message
      : check.kind === "rule"
        ? t(`editor.checks.rules.${check.rule}`)
        : t("editor.checks.unbound");

  return (
    <div className="space-y-3" data-checks>
      <div>
        <h2 className="font-display text-base font-semibold">
          {t("editor.checks.title", { count: checks.length })}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("editor.checks.note")}
        </p>
      </div>
      <ul className="max-h-80 divide-y overflow-y-auto">
        {checks.map((check, i) => {
          const about = target(check);
          const Icon = check.severity === "error" ? CircleAlert : AlertTriangle;
          return (
            <li
              key={i}
              className="flex items-start gap-2.5 py-2.5"
              data-check={check.kind}
            >
              <Icon
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  check.severity === "error"
                    ? "text-destructive"
                    : "text-status-warning",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {about?.name ?? t("editor.checks.plate")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {message(check)}
                </p>
              </div>
              {about?.selection && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0"
                  onClick={() => {
                    editor.setTool("select");
                    editor.select(about.selection);
                    onPick?.();
                  }}
                >
                  {t(
                    check.kind === "unbound"
                      ? "editor.checks.bind"
                      : "editor.checks.show",
                  )}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

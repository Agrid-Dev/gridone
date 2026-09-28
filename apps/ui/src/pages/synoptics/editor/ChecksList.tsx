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

  const target = (id: string | null) => {
    if (!id) return null;
    const symbol = doc.symbols?.find((s) => s.id === id);
    if (symbol) {
      return {
        name: symbolName(symbol, vocabulary.typeLabel),
        selection: { kind: "symbol" as const, id: symbol.id },
      };
    }
    const pipe = doc.pipes?.find((p) => p.id === id);
    if (pipe) {
      return {
        name: pipeName(pipe, vocabulary.fluidLabel),
        selection: { kind: "pipe" as const, id: pipe.id },
      };
    }
    return { name: id, selection: null };
  };
  const message = (check: Check) =>
    check.kind === "saved"
      ? check.message
      : check.kind === "rule"
        ? t(`editor.checks.rules.${check.rule}`)
        : check.kind === "overlap"
          ? t("editor.checks.overlap", { count: check.count })
          : check.kind === "binding"
            ? t("editor.checks.binding", {
                slot: vocabulary.slotLabel(check.slot),
              })
            : t("editor.checks.unbound");

  const pick = (selection: SynopticEditorState["selection"]) => {
    editor.setTool("select");
    editor.select(selection);
    onPick?.();
  };

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
          const about = target(check.element);
          const other = check.kind === "overlap" ? target(check.other) : null;
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
                  {other && ` / ${other.name}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {message(check)}
                </p>
              </div>
              {check.kind === "overlap" ? (
                <div className="flex max-w-40 flex-col gap-1">
                  {[about, other].map(
                    (pipe) =>
                      pipe?.selection && (
                        <Button
                          key={pipe.selection.id}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          aria-label={t("editor.checks.showElement", {
                            name: pipe.name,
                          })}
                          onClick={() => pick(pipe.selection)}
                        >
                          <span className="truncate">{pipe.name}</span>
                        </Button>
                      ),
                  )}
                </div>
              ) : (
                about?.selection && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => {
                      pick(about.selection);
                    }}
                  >
                    {t(
                      check.kind === "unbound"
                        ? "editor.checks.bind"
                        : "editor.checks.show",
                    )}
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

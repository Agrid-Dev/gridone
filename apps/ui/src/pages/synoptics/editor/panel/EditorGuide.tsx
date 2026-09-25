import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import type { SynopticEditorState } from "../useSynopticEditor";
import { Section } from "./InspectorHeader";

type Step = "place" | "connect" | "onPipe" | "bind";
const STEPS: Step[] = ["place", "connect", "onPipe", "bind"];

/** The shortcuts the guide lists, by the key the author presses. */
const SHORTCUTS = [
  ["V", "select"],
  ["P", "pipe"],
  ["R", "rotate"],
  ["⌘D", "duplicate"],
  ["⌘Z", "undo"],
  ["delete", "delete"],
] as const;

/**
 * What the panel shows with nothing selected: how a plate is built, in
 * four steps ticked as the plate gets there, and the keys that do it.
 */
export function EditorGuide({ editor }: { editor: SynopticEditorState }) {
  const { t } = useTranslation("synoptics");
  const { doc, checks } = editor;
  const symbols = doc.symbols ?? [];
  const unbound = checks.filter((c) => c.kind === "unbound").length;
  const done: Record<Step, boolean> = {
    place: symbols.some((s) => s.placement.kind === "cell"),
    connect: (doc.pipes ?? []).length > 0,
    onPipe: symbols.some((s) => s.placement.kind === "pipe"),
    bind: symbols.length > 0 && unbound === 0,
  };
  const current = STEPS.find((step) => !done[step]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-display text-base font-semibold">
          {t(symbols.length ? "editor.guide.title" : "editor.guide.empty")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("editor.noSelection")}
        </p>
      </div>
      <Section title={t("editor.guide.steps")}>
        <ol className="space-y-3.5">
          {STEPS.map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3"
              data-guide-step={step}
              data-done={done[step] || undefined}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  done[step]
                    ? "bg-status-ok text-status-ok-foreground"
                    : step === current
                      ? "border-2 border-primary text-primary"
                      : "border text-muted-foreground",
                )}
              >
                {done[step] ? (
                  <Check aria-hidden className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="space-y-0.5">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    !done[step] && step !== current && "text-muted-foreground",
                  )}
                >
                  {t(`editor.guide.${step}.title`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {step === "bind" && unbound > 0
                    ? t("editor.guide.bind.left", { count: unbound })
                    : t(`editor.guide.${step}.hint`)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title={t("editor.guide.shortcuts")}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
          {SHORTCUTS.map(([key, action]) => (
            <div key={action} className="contents">
              <dt>
                <Kbd>{key === "delete" ? t("editor.keys.delete") : key}</Kbd>
              </dt>
              <dd>{t(`editor.shortcuts.${action}`)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">{t("editor.hints.pan")}</p>
      </Section>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { Check, CircleDot, Spline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { usePlateVocabulary } from "../../usePlateVocabulary";
import { pipeName, symbolName } from "../names";
import type { SynopticEditorState } from "../useSynopticEditor";
import { FluidPicker } from "./FluidPicker";
import { Section } from "./InspectorHeader";
import { SegmentedControl } from "./SegmentedControl";

/**
 * The pipe tool's own panel: the fluid the next run carries, the height
 * its bends are drawn at (in the isometric view only: a flat plate is all
 * floor), and where the run being drawn stands, with the two ways out of
 * it.
 */
export function PipeToolPanel({ editor }: { editor: SynopticEditorState }) {
  const { t } = useTranslation("synoptics");
  const vocabulary = usePlateVocabulary();
  const { draw, doc } = editor;
  const [first] = draw.points;
  const bends = Math.max(0, draw.points.length - 1);
  const startText = (() => {
    if (!first) return null;
    const e = first.endpoint;
    if (e.kind === "port") {
      const symbol = doc.symbols?.find((s) => s.id === e.symbol);
      return symbol ? symbolName(symbol, vocabulary.typeLabel) : e.symbol;
    }
    if (e.kind === "pipe") {
      const trunk = doc.pipes?.find((p) => p.id === e.pipe);
      return t("editor.pipeInspector.teeOn", {
        run: trunk ? pipeName(trunk, vocabulary.fluidLabel) : e.pipe,
      });
    }
    return t("editor.pipeInspector.freeEnd");
  })();
  const step = (done: boolean, text: string, key: string) => (
    <li key={key} className="flex items-start gap-2.5 text-sm">
      {done ? (
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-status-ok" />
      ) : (
        <CircleDot
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-primary"
        />
      )}
      <span>{text}</span>
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Spline aria-hidden className="size-5" />
        </span>
        <h2 className="font-display text-base font-semibold">
          {t("editor.pipeTool.title")}
        </h2>
      </div>
      <Section
        title={t("editor.fluid")}
        aside={
          <span className="text-xs text-muted-foreground">
            {t("editor.pipeTool.fluidHint")}
          </span>
        }
      >
        <FluidPicker value={draw.fluid} onChange={draw.setFluid} />
      </Section>
      {doc.projection !== "flat" && (
        <Section title={t("editor.pipeTool.level")}>
          <SegmentedControl
            label={t("editor.pipeTool.level")}
            value={draw.level}
            onChange={draw.setLevel}
            options={[
              { value: 0, label: t("editor.pipeTool.floor") },
              { value: 1, label: t("editor.pipeTool.overhead") },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {t("editor.pipeTool.levelHint")}
          </p>
        </Section>
      )}
      <Section title={t("editor.pipeTool.progress")}>
        <ol className="space-y-2" data-pipe-progress>
          {step(
            !!first,
            first
              ? t("editor.pipeTool.from", { start: startText })
              : t("editor.pipeTool.pickStart"),
            "start",
          )}
          {first &&
            step(
              bends > 0,
              t("editor.pipeTool.bends", { count: bends }),
              "bends",
            )}
          {first && step(false, t("editor.pipeTool.pickEnd"), "end")}
        </ol>
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 justify-center gap-2"
            disabled={draw.points.length < 2}
            onClick={() => draw.finish()}
          >
            {t("editor.pipeTool.finish")}
            <Kbd className="border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground">
              {t("editor.keys.enter")}
            </Kbd>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={!first}
            onClick={draw.cancel}
          >
            {t("editor.pipeTool.cancel")}
            <Kbd>{t("editor.keys.escape")}</Kbd>
          </Button>
        </div>
      </Section>
    </div>
  );
}

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CommandTemplate } from "@/api/commands";
import type { Asset } from "@/api/assets";
import { TargetPresenter } from "./TargetPresenter";
import { WritePresenter } from "./WritePresenter";

type CommandTemplatePresenterProps = {
  /** A full ``CommandTemplate`` or just its ``(target, write)`` — the same
   *  shape is reused inside the wizard review step and will be embedded in
   *  the upcoming automation form, where the template may not be saved yet. */
  template: Pick<CommandTemplate, "target" | "write">;
  assetsById?: Record<string, Asset>;
  className?: string;
};

/** Composite target + payload presenter, shared by the templates list, the
 *  template detail page, the wizard review step, and (soon) the automation
 *  form. Wraps the two sub-presenters in a single card with consistent
 *  labelling. */
export function CommandTemplatePresenter({
  template,
  assetsById,
  className,
}: CommandTemplatePresenterProps) {
  const { t } = useTranslation("devices");
  return (
    <Card className={cn(className)}>
      <CardContent className="space-y-5 py-5">
        <Section title={t("commands.templates.targetCard")}>
          <TargetPresenter target={template.target} assetsById={assetsById} />
        </Section>
        <Section title={t("commands.templates.payloadCard")}>
          <WritePresenter write={template.write} />
        </Section>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

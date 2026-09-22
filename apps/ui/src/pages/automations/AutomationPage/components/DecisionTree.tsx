import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  GitBranch,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationBranch } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { ConditionSummary } from "@/pages/devices/device/operating-rules/OperatingRuleSummary";
import { ActionPresenter } from "../presenters/ActionPresenter";
import {
  useAutomationCatalog,
  useDecisionTree,
} from "../hooks/useDecisionTree";
import { BranchEditor } from "./BranchEditor";

export function DecisionTree({
  branches,
  onChange,
  selectedBranchId,
}: {
  branches: AutomationBranch[];
  onChange?: (branches: AutomationBranch[]) => void;
  selectedBranchId?: string | null;
}) {
  const { t } = useTranslation("automations");
  const catalog = useAutomationCatalog();
  const state = useDecisionTree(branches, onChange);
  return (
    <section aria-label={t("tree.title")} className="space-y-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <GitBranch className="size-4" />
        {t("tree.firstMatch")}
      </p>
      <ol className="space-y-0">
        {branches.map((branch, index) => (
          <li key={branch.id ?? index} className="relative pb-5">
            {index > 0 && (
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <ArrowDown className="size-4" />
                {t("tree.otherwise")}
              </p>
            )}
            <div
              className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] ${selectedBranchId && selectedBranchId === branch.id ? "border-primary bg-primary/5" : "bg-card"}`}
            >
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {t("tree.branch", { number: index + 1 })}
                  {branch.name && ` · ${branch.name}`}
                </p>
                <div className="text-sm leading-relaxed">
                  {branch.condition ? (
                    <ConditionSummary
                      value={branch.condition}
                      catalog={catalog}
                    />
                  ) : (
                    t("tree.always")
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{t("tree.then")}</span>
                <ArrowRight className="size-4" />
              </div>
              <div className="min-w-0 border-l-2 border-primary/30 pl-4">
                <ActionPresenter action={branch.action} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("tree.stopAfterMatch")}
                </p>
              </div>
              {branches.slice(0, index).some((item) => !item.condition) && (
                <p className="text-xs text-amber-700 md:col-span-3">
                  {t("tree.unreachable")}
                </p>
              )}
              {onChange && (
                <div className="flex flex-wrap justify-end gap-1 border-t pt-3 md:col-span-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("tree.moveUp", { number: index + 1 })}
                    disabled={index === 0}
                    onClick={() => state.move(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("tree.moveDown", { number: index + 1 })}
                    disabled={index === branches.length - 1}
                    onClick={() => state.move(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => state.setEditing(index)}
                  >
                    <Pencil />
                    {t("tree.editBranch")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("tree.removeBranch", { number: index + 1 })}
                    disabled={branches.length === 1}
                    onClick={() => state.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        {t("tree.noMatch")}
      </p>
      {onChange && (
        <Button
          variant="outline"
          disabled={branches.length >= 64}
          onClick={() => state.setEditing(branches.length)}
        >
          <Plus />
          {t("tree.addBranch")}
        </Button>
      )}
      {state.editing !== null && (
        <BranchEditor
          initial={branches[state.editing]}
          onSave={state.save}
          onClose={() => state.setEditing(null)}
        />
      )}
    </section>
  );
}

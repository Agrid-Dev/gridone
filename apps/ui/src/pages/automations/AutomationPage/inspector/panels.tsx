import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import type { Action } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { ConditionRows } from "@/pages/devices/device/operating-rules/ConditionRows";
import { ConditionPhrase } from "@/pages/devices/device/operating-rules/RuleSentence";
import { emptyCondition } from "@/pages/devices/device/operating-rules/expressions";
import TriggerForm from "../form/TriggerForm";
import ActionForm from "../form/ActionForm";
import { TriggerPresenter } from "../presenters/TriggerPresenter";
import { ActionPresenter } from "../presenters/ActionPresenter";
import { AutomationDiagnostics } from "../components/AutomationDiagnostics";
import type { AutomationEditorState } from "../editor/useAutomationEditor";
import { caseAt, decisionAt, outcomeAt, type LevelId } from "../tree/model";
import { useTree } from "../tree/TreeContext";
import { CaseOrder } from "./CaseOrder";
import { CaseSentence, OtherwiseSentence, PlainWords } from "./PlainWords";

type PanelProps = { editor: AutomationEditorState };

function Section({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Shown when the selected element disappeared (undo, cancel, removal). */
function Gone() {
  const { t } = useTranslation("automations");
  return <p className="text-sm text-muted-foreground">{t("panel.gone")}</p>;
}

// ----------------------------------------------------------- automation

export function AutomationPanel({
  editor,
  onDelete,
  isDeleting,
}: PanelProps & { onDelete?: () => Promise<unknown>; isDeleting?: boolean }) {
  const { t } = useTranslation(["automations", "common"]);
  const nameId = useId();
  const descriptionId = useId();
  const enabledId = useId();
  const { draft, automation, canWrite } = editor;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>{t("fields.name")}</Label>
        <Input
          id={nameId}
          value={draft.name}
          disabled={!canWrite}
          aria-invalid={!draft.name.trim() || undefined}
          placeholder={t("editor.namePlaceholder")}
          onChange={(event) => editor.setName(event.target.value)}
        />
        {!draft.name.trim() && canWrite && (
          <p className="text-xs text-amber-700">{t("editor.nameRequired")}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={descriptionId}>{t("fields.description")}</Label>
        <Textarea
          id={descriptionId}
          rows={3}
          value={draft.description}
          disabled={!canWrite}
          onChange={(event) => editor.setDescription(event.target.value)}
        />
      </div>
      {editor.mode.kind === "create" && (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={enabledId} className="font-normal">
            {t("editor.enableOnCreate")}
          </Label>
          <Switch
            id={enabledId}
            checked={draft.enabled}
            onCheckedChange={editor.setEnabled}
          />
        </div>
      )}
      {automation?.id && <AutomationDiagnostics id={automation.id} />}
      {automation?.guardrails && (
        <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("tree.guardrails", {
            max: automation.guardrails.max_executions,
            seconds: automation.guardrails.window_seconds,
            failures: automation.guardrails.max_consecutive_failures,
          })}
        </p>
      )}
      {automation && <Authorship editor={editor} />}
      {automation && canWrite && onDelete && (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-muted-foreground">
            {t("editPage.deleteHint")}
          </p>
          <ConfirmButton
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isDeleting}
            onConfirm={onDelete}
            confirmTitle={t("common:deletion.title", {
              name: automation.name || automation.id,
            })}
            confirmDetails={
              <>
                {t("deleteConfirm.details", {
                  name: automation.name || automation.id,
                })}{" "}
                {t("common:deletion.irreversible")}
              </>
            }
            confirmLabel={t("actions.delete")}
          >
            <Trash2 aria-hidden />
            {t("actions.delete")}
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}

function Authorship({ editor }: PanelProps) {
  const { t } = useTranslation("automations");
  const automation = editor.automation!;
  const creator = useUser(automation.created_by);
  const { created_at: createdAt, updated_at: updatedAt } = automation;
  if (!createdAt) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {t("metadata.createdAt")} : {formatMoment(createdAt)}
      {creator && ` · ${t("metadata.createdBy")} : ${creator.username}`}
      {updatedAt &&
        updatedAt !== createdAt &&
        ` · ${t("metadata.updatedAt")} : ${formatMoment(updatedAt)}`}
    </p>
  );
}

function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// -------------------------------------------------------------- trigger

export function TriggerPanel({ editor }: PanelProps) {
  const { t } = useTranslation("automations");
  const trigger = editor.draft.trigger;
  if (!editor.canWrite)
    return trigger ? <TriggerPresenter trigger={trigger} /> : <Gone />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("panel.trigger.help")}</p>
      <TriggerForm
        key={`trigger-${editor.draftKey}`}
        initialValue={trigger ?? undefined}
        onChange={editor.setTrigger}
        onSubmit={() => editor.save()}
        onCancel={editor.cancel}
        hideActions
        serverError={editor.serverError}
      />
    </div>
  );
}

// ------------------------------------------------------------- decision

export function DecisionPanel({
  editor,
  levelId,
}: PanelProps & { levelId: LevelId }) {
  const { t } = useTranslation("automations");
  const decision = decisionAt(editor.draft.branches, levelId);
  if (!decision) return <Gone />;
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("panel.decision.help")}
      </p>
      <Section title={t("panel.order.title")}>
        <CaseOrder
          decision={decision}
          onMove={editor.moveCase}
          onAdd={() => editor.addCase(levelId)}
        />
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- case

export function CasePanel({
  editor,
  branchId,
}: PanelProps & { branchId: string }) {
  const { t } = useTranslation("automations");
  const { catalog, editable } = useTree();
  const nameId = useId();
  const found = caseAt(editor.draft.branches, branchId);
  if (!found) return <Gone />;
  const { item, decision } = found;
  const condition = item.branch.condition;
  const incomplete = editor.incompleteConditions.has(branchId);
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>
          {t("panel.case.name")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("panel.optional")}
          </span>
        </Label>
        <Input
          id={nameId}
          value={item.branch.name ?? ""}
          disabled={!editable}
          placeholder={t("panel.case.namePlaceholder")}
          onChange={(event) =>
            editor.updateCase(branchId, { name: event.target.value })
          }
        />
      </div>
      <Section title={t("panel.case.condition")}>
        {item.unreachable && (
          <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("panel.case.unreachable")}
          </p>
        )}
        {condition == null ? (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {t("tree.alwaysTrueHint")}
            </p>
            {editable && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  editor.updateCase(branchId, { condition: emptyCondition() })
                }
              >
                <Plus aria-hidden />
                {t("tree.insertCondition")}
              </Button>
            )}
          </div>
        ) : editable ? (
          <ConditionRows
            value={condition}
            onChange={(next) =>
              editor.updateCase(branchId, { condition: next })
            }
            catalog={catalog}
            eventContext
          />
        ) : (
          <p className="text-sm leading-relaxed">
            <ConditionPhrase value={condition} catalog={catalog} />
          </p>
        )}
        {incomplete && (
          <p role="status" className="text-xs text-amber-700">
            {t("panel.case.incomplete")}
          </p>
        )}
      </Section>
      <Section title={t("panel.order.title")}>
        <CaseOrder
          decision={decision}
          current={branchId}
          onMove={editor.moveCase}
          onAdd={() => editor.addCase(decision.levelId)}
        />
      </Section>
    </div>
  );
}

export function CaseFooter({
  editor,
  branchId,
}: PanelProps & { branchId: string }) {
  const found = caseAt(editor.draft.branches, branchId);
  if (!found || editor.incompleteConditions.has(branchId)) return null;
  return (
    <PlainWords>
      <CaseSentence item={found.item} />
    </PlainWords>
  );
}

// ------------------------------------------------------------ otherwise

export function OtherwisePanel({
  editor,
  levelId,
}: PanelProps & { levelId: LevelId }) {
  const { t } = useTranslation("automations");
  const { editable } = useTree();
  const decision = decisionAt(editor.draft.branches, levelId);
  const [wantsAction, setWantsAction] = useState(
    () => decision?.otherwise.branch != null,
  );
  const { setOtherwise, changeAction } = editor;
  // Once "otherwise" has its branch, its form edits it like any action —
  // an incomplete form then blocks Save instead of keeping the old action.
  const otherwiseId = decision?.otherwise.branch?.id;
  const otherwiseIdRef = useRef(otherwiseId);
  otherwiseIdRef.current = otherwiseId;
  const onAction = useCallback(
    (action: Action | null) => {
      const id = otherwiseIdRef.current;
      if (id) changeAction(id, action);
      else if (action) setOtherwise(levelId, action);
    },
    [levelId, setOtherwise, changeAction],
  );
  if (!decision) return <Gone />;
  const outcome = decision.otherwise.outcome;
  const nested = outcome?.kind === "decision";
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("panel.otherwise.help")}
      </p>
      <fieldset className="space-y-2" disabled={!editable}>
        <legend className="sr-only">{t("panel.otherwise.choice")}</legend>
        <ChoiceRow
          name={`otherwise-${levelId}`}
          checked={!wantsAction}
          onSelect={() => {
            setWantsAction(false);
            setOtherwise(levelId, null);
          }}
          title={t("tree.nothing")}
          hint={t("panel.otherwise.nothingHint")}
        />
        <ChoiceRow
          name={`otherwise-${levelId}`}
          checked={wantsAction}
          onSelect={() => setWantsAction(true)}
          title={t("panel.otherwise.act")}
          hint={t("panel.otherwise.actHint")}
        />
      </fieldset>
      {wantsAction &&
        (nested ? (
          <p className="text-sm text-muted-foreground">
            {t("panel.otherwise.nested")}
          </p>
        ) : editable ? (
          <ActionForm
            key={`otherwise-${levelId}-${editor.draftKey}`}
            initialValue={
              outcome?.kind === "action" ? outcome.action : undefined
            }
            onChange={onAction}
            onSubmit={() => editor.save()}
            onCancel={() => {}}
            hideActions
          />
        ) : outcome?.kind === "action" ? (
          <ActionPresenter action={outcome.action} />
        ) : null)}
    </div>
  );
}

function ChoiceRow({
  name,
  checked,
  onSelect,
  title,
  hint,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked ? "border-primary bg-accent" : "hover:bg-muted/50",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 accent-[hsl(var(--primary))]"
      />
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function OtherwiseFooter({
  editor,
  levelId,
}: PanelProps & { levelId: LevelId }) {
  const decision = decisionAt(editor.draft.branches, levelId);
  if (!decision) return null;
  return (
    <PlainWords>
      <OtherwiseSentence decision={decision} />
    </PlainWords>
  );
}

// --------------------------------------------------------------- action

/**
 * The action at the end of one path — or the choice of one when the path has
 * none yet. One form for both, keyed by the branch, so choosing the first
 * action does not remount it under the user's cursor.
 */
export function OutcomePanel({
  editor,
  branchId,
}: PanelProps & { branchId: string }) {
  const { t } = useTranslation("automations");
  const { editable } = useTree();
  const outcome = outcomeAt(editor.draft.branches, branchId);
  const [formKey, setFormKey] = useState(0);
  const hasAction = outcome?.kind === "action";
  const hasActionRef = useRef(hasAction);
  hasActionRef.current = hasAction;
  const { changeAction, chooseAction } = editor;
  const onChange = useCallback(
    (action: Action | null) => {
      if (hasActionRef.current) changeAction(branchId, action);
      else if (action) chooseAction(branchId, action);
    },
    [branchId, changeAction, chooseAction],
  );
  if (!outcome) return <Gone />;
  if (!editable)
    return outcome.kind === "action" ? (
      <ActionPresenter action={outcome.action} />
    ) : (
      <p className="text-sm text-muted-foreground">{t("tree.chooseAction")}</p>
    );
  return (
    <div className="space-y-5">
      <ActionForm
        key={`outcome-${branchId}-${editor.draftKey}-${formKey}`}
        initialValue={outcome.kind === "action" ? outcome.action : undefined}
        onChange={onChange}
        onSubmit={() => editor.save()}
        onCancel={() => {}}
        hideActions
      />
      {outcome.kind === "action" && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!editor.canAddBranch}
            onClick={() => editor.insertCondition(outcome.target)}
          >
            <Plus aria-hidden />
            {t("panel.action.addConditionBefore")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              editor.removeAction(branchId);
              setFormKey((key) => key + 1);
            }}
          >
            <Trash2 aria-hidden />
            {t("panel.action.remove")}
          </Button>
        </div>
      )}
    </div>
  );
}

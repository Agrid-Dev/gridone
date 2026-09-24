import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  History,
  PanelRightOpen,
  X,
  Zap,
} from "lucide-react";
import type { AutomationExecution } from "@gridone/sdk";
import { BackLink } from "@/components/BackLink";
import { Button } from "@/components/ui/button";
import { useFullBleedPage } from "@/components/layout/PageLayout";
import { formatTimeAgo } from "@/lib/utils";
import { AutomationControl } from "../../components/AutomationControl";
import { AutomationStatusBadge } from "../../components/AutomationStatusBadge";
import {
  executionTime,
  formatExecutionMoment,
} from "../../components/executionsSummary";
import { useAutomationCatalog } from "../hooks/useAutomationCatalog";
import { useAutomationExecutions } from "../hooks/useAutomationExecutions";
import { Inspector } from "../inspector/Inspector";
import { AutomationTree } from "../tree/AutomationTree";
import { MAX_TREE_DEPTH, replayOf } from "../tree/model";
import { RunChip } from "../tree/nodes";
import { TreeCanvas } from "../tree/TreeCanvas";
import {
  TreeContext,
  useTree,
  type TreeContextValue,
} from "../tree/TreeContext";
import {
  useAutomationEditor,
  type AutomationEditorState,
  type EditorMode,
} from "./useAutomationEditor";

/**
 * The automation editor, for a new automation as for an existing one: the
 * tree on a canvas, the selected element editable in the side panel, and one
 * Save for the whole draft.
 */
export function AutomationEditor({
  mode,
  onDelete,
  isDeleting,
}: {
  mode: EditorMode;
  onDelete?: () => Promise<unknown>;
  isDeleting?: boolean;
}) {
  useFullBleedPage();
  const { t } = useTranslation("automations");
  const editor = useAutomationEditor(mode);
  const catalog = useAutomationCatalog();
  const automationId = mode.kind === "edit" ? (mode.automation.id ?? "") : "";
  const { executions, isLoading, last } = useAutomationExecutions(automationId);
  const [panelOpen, setPanelOpen] = useState(true);

  const replayed = executions.find(
    (execution) => execution.id === editor.replayId,
  );
  const replay = useMemo(
    () => (replayed ? replayOf(replayed) : null),
    [replayed],
  );

  const {
    canWrite,
    selection,
    select,
    draft,
    incompleteConditions,
    incompleteActions,
    insertCondition,
    addCase,
    canAddBranch,
  } = editor;
  const context = useMemo<TreeContextValue>(
    () => ({
      editable: canWrite && !replay,
      selection,
      select: (next) => {
        select(next);
        setPanelOpen(true);
      },
      // A replay shows what ran: the saved version, not the draft.
      trigger: replay ? editor.saved.trigger : draft.trigger,
      catalog,
      incompleteConditions,
      incompleteActions,
      replay,
      insertCondition,
      addCase,
      canAddBranch,
      maxDepth: MAX_TREE_DEPTH,
    }),
    [
      canWrite,
      replay,
      selection,
      select,
      draft.trigger,
      editor.saved.trigger,
      catalog,
      incompleteConditions,
      incompleteActions,
      insertCondition,
      addCase,
      canAddBranch,
    ],
  );

  return (
    <TreeContext.Provider value={context}>
      <section className="flex min-h-[calc(100dvh-4rem)] flex-col lg:h-[calc(100dvh-4rem)]">
        <EditorHeader
          editor={editor}
          lastExecution={last ? executionTime(last) : null}
        />
        {mode.kind === "edit" && mode.automation.deactivation && (
          <DeactivationBanner editor={editor} />
        )}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex h-[65vh] min-h-0 min-w-0 flex-1 lg:h-auto">
            <TreeCanvas
              label={t("tree.title")}
              onBackgroundClick={() => select({ kind: "automation" })}
              banner={
                replayed && (
                  <ReplayBanner
                    execution={replayed}
                    executionIds={executions.map((execution) => execution.id)}
                    onReplay={editor.setReplayId}
                  />
                )
              }
            >
              <AutomationTree
                branches={replay ? editor.saved.branches : draft.branches}
              />
            </TreeCanvas>
          </div>
          {panelOpen ? (
            <Inspector
              editor={editor}
              executions={executions}
              isLoadingExecutions={isLoading}
              onDelete={onDelete}
              isDeleting={isDeleting}
              onCollapse={() => setPanelOpen(false)}
            />
          ) : (
            <div className="hidden border-l bg-card p-1.5 lg:block">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("panel.expand")}
                onClick={() => setPanelOpen(true)}
              >
                <PanelRightOpen aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </section>
    </TreeContext.Provider>
  );
}

function EditorHeader({
  editor,
  lastExecution,
}: {
  editor: AutomationEditorState;
  lastExecution: number | null;
}) {
  const { t } = useTranslation(["automations", "common"]);
  const { t: tCommon } = useTranslation("common");
  const { mode, draft, canWrite } = editor;
  const title = draft.name.trim() || t("editor.untitled");
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b bg-card px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1 space-y-1.5">
        <nav
          aria-label={t("editPage.breadcrumbLabel")}
          className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground"
        >
          <BackLink to="/automations">{t("title")}</BackLink>
          <ChevronRight aria-hidden className="size-4 shrink-0 opacity-50" />
          <span className="truncate font-medium text-foreground">{title}</span>
        </nav>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          >
            <Zap className="size-[18px]" />
          </span>
          <h1
            data-page-title
            tabIndex={-1}
            className="truncate font-display text-2xl font-semibold tracking-tight"
          >
            {title}
          </h1>
          {mode.kind === "edit" && (
            <AutomationStatusBadge
              enabled={mode.automation.enabled ?? true}
              deactivation={mode.automation.deactivation}
            />
          )}
          {mode.kind === "edit" && (
            <span className="text-sm text-muted-foreground">
              {lastExecution
                ? t("editPage.lastExecution", {
                    ago: formatTimeAgo(lastExecution, tCommon),
                  })
                : t("editPage.neverExecuted")}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && <SaveState editor={editor} />}
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            onClick={editor.cancel}
            disabled={
              editor.isSaving || (mode.kind === "edit" && !editor.hasChanges)
            }
          >
            {t("common:common.cancel")}
          </Button>
        )}
        {canWrite && (
          <Button
            type="button"
            onClick={editor.save}
            disabled={!editor.canSave}
          >
            {editor.isSaving
              ? t("common:common.saving")
              : t(
                  mode.kind === "create"
                    ? "editor.create"
                    : "editPage.saveChanges",
                )}
          </Button>
        )}
        {canWrite && mode.kind === "edit" && (
          <span className="ml-1 flex items-center border-l pl-3">
            <AutomationControl automation={mode.automation} />
          </span>
        )}
      </div>
    </header>
  );
}

/** What stands between the draft and Save, with a way to go and fix it. */
function SaveState({ editor }: { editor: AutomationEditorState }) {
  const { t } = useTranslation("automations");
  // The tree's select also reopens a collapsed panel.
  const { select } = useTree();
  const { blockers, hasChanges, mode } = editor;
  if (blockers.length)
    return (
      <p className="flex items-center gap-1.5 text-sm text-amber-700">
        {t("editor.toComplete", { count: blockers.length })}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-amber-800 underline"
          onClick={() => select(blockers[0])}
        >
          {t("editor.show")}
        </Button>
      </p>
    );
  if (mode.kind === "edit")
    return (
      <p className="text-sm text-muted-foreground">
        {t(hasChanges ? "editPage.unsavedChanges" : "editor.allSaved")}
      </p>
    );
  return null;
}

/** Who stopped the automation, why and when: the operator, or a tripped guard. */
function DeactivationBanner({ editor }: { editor: AutomationEditorState }) {
  const { t } = useTranslation("automations");
  const deactivation = editor.automation?.deactivation;
  if (!deactivation) return null;
  const breaker = deactivation.source === "circuit_breaker";
  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-6 py-2.5 text-sm"
    >
      <span className="font-semibold text-amber-800 dark:text-amber-200">
        {t(breaker ? "deactivation.breaker" : "disabledBadge")}
      </span>{" "}
      {deactivation.reason && (
        <>
          ·{" "}
          {breaker
            ? t(`reasons.${deactivation.reason}`, {
                defaultValue: deactivation.reason,
              })
            : deactivation.reason}{" "}
        </>
      )}
      <span className="text-muted-foreground">
        · {deactivation.actor_id} ·{" "}
        {new Date(deactivation.at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </span>
    </div>
  );
}

/** Tells the canvas it shows one past execution, and moves between them. */
function ReplayBanner({
  execution,
  executionIds,
  onReplay,
}: {
  execution: AutomationExecution;
  executionIds: string[];
  onReplay: (id: string | null) => void;
}) {
  const { t, i18n } = useTranslation("automations");
  const index = executionIds.indexOf(execution.id);
  // Executions are listed newest first: "previous" goes back in time.
  const older = executionIds[index + 1];
  const newer = executionIds[index - 1];
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-primary/25 bg-card px-4 py-2.5">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
      >
        <History className="size-4" />
      </span>
      <p className="text-sm font-semibold">
        {t("replay.title", {
          moment: formatExecutionMoment(
            execution,
            i18n?.resolvedLanguage ?? i18n?.language,
            t,
          ),
        })}
      </p>
      <RunChip execution={execution} />
      <span className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={t("replay.older")}
          disabled={!older}
          onClick={() => older && onReplay(older)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={t("replay.newer")}
          disabled={!newer}
          onClick={() => newer && onReplay(newer)}
        >
          <ChevronRight aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onReplay(null)}
        >
          <X aria-hidden />
          {t("replay.quit")}
        </Button>
      </span>
    </div>
  );
}

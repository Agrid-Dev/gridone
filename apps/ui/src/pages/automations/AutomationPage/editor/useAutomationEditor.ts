import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  Action,
  Automation,
  AutomationBranch,
  Trigger,
  WriteCondition,
} from "@gridone/sdk";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { emptyCondition } from "@/pages/devices/device/operating-rules/expressions";
import { useConditionCompleteness } from "../hooks/useAutomationCatalog";
import {
  MAX_TREE_BRANCHES,
  MAX_TREE_DEPTH,
  addCase as addCaseTo,
  countBranches,
  emptyTree,
  findBranch,
  levelOf,
  otherwiseIndex,
  insertCondition as insertConditionAt,
  moveCase as moveCaseTo,
  normalizeTree,
  removeAction as removeActionFrom,
  removeBranch as removeBranchFrom,
  replaceAction,
  setAction,
  setOtherwise as setOtherwiseAt,
  treeDepth,
  treeIssues,
  updateCase as updateCaseIn,
  type InsertTarget,
  type LevelId,
} from "../tree/model";
import type { Selection } from "../tree/TreeContext";

export type EditorMode =
  | { kind: "create" }
  | { kind: "edit"; automation: Automation };

export type Draft = {
  name: string;
  description: string;
  enabled: boolean;
  trigger: Trigger | null;
  branches: AutomationBranch[];
};

export type PanelTab = "configure" | "executions";

export function draftOf(automation: Automation | null): Draft {
  if (!automation)
    return {
      name: "",
      description: "",
      enabled: true,
      trigger: null,
      branches: emptyTree(),
    };
  return {
    name: automation.name,
    description: automation.description ?? "",
    enabled: automation.enabled ?? true,
    trigger: automation.trigger,
    branches: normalizeTree(automation.branches),
  };
}

/** What Save sends and what "unsaved changes" compares. */
function savedFields(draft: Draft) {
  return {
    name: draft.name.trim(),
    description: draft.description,
    trigger: draft.trigger,
    branches: draft.branches,
  };
}

/** Structural comparison that ignores key order (API JSON vs rebuilt drafts). */
export function sameShape(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : entry,
  );
}

function withId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return set.has(id) ? set : new Set([...set, id]);
}

function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
}

/**
 * State behind the automation editor, for a new automation as for an existing
 * one: the draft (name, trigger, tree), what is selected on the tree, what
 * still blocks saving, and the replay of one execution.
 */
export function useAutomationEditor(mode: EditorMode) {
  const { t } = useTranslation("automations");
  const can = usePermissions();
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const automation = mode.kind === "edit" ? mode.automation : null;

  const [baseline, setBaseline] = useState(() => draftOf(automation));
  const [draft, setDraft] = useState(baseline);
  const [incompleteActions, setIncompleteActions] = useState<
    ReadonlySet<string>
  >(new Set());
  const [triggerIncomplete, setTriggerIncomplete] = useState(false);
  // Bumped on cancel so the forms in the panel remount on the saved values.
  const [draftKey, setDraftKey] = useState(0);
  const [selection, setSelection] = useState<Selection>(
    mode.kind === "create" ? { kind: "trigger" } : { kind: "automation" },
  );
  const [tab, setTab] = useState<PanelTab>("configure");
  const [replayId, setReplayId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<unknown>(undefined);

  const canWrite = can("automations:write");
  const isComplete = useConditionCompleteness();

  const setBranches = useCallback(
    (update: (branches: AutomationBranch[]) => AutomationBranch[]) =>
      setDraft((current) => {
        const branches = update(current.branches);
        // A no-op edit (a form re-reporting its value) keeps the very draft.
        return branches === current.branches
          ? current
          : { ...current, branches };
      }),
    [],
  );
  // The latest tree, for the operations that must say what they created.
  const branchesRef = useRef(draft.branches);
  branchesRef.current = draft.branches;

  const select = useCallback((next: Selection) => {
    setSelection(next);
    setTab("configure");
    setReplayId(null);
  }, []);

  const issues = useMemo(
    () => treeIssues(draft.branches, isComplete),
    [draft.branches, isComplete],
  );
  const incompleteConditions = useMemo(
    () =>
      new Set(
        issues.flatMap((issue) =>
          issue.kind === "condition" ? [issue.branchId] : [],
        ),
      ),
    [issues],
  );

  /** Marks on branches that still end with an action; the others went away. */
  const liveIncompleteActions = useMemo(() => {
    const live = [...incompleteActions].filter(
      (id) => findBranch(draft.branches, id)?.branch.action,
    );
    return live.length === incompleteActions.size
      ? incompleteActions
      : new Set(live);
  }, [incompleteActions, draft.branches]);

  /** Everything that blocks Save, in reading order, each with where to fix it. */
  const blockers = useMemo(() => {
    const list: Selection[] = [];
    if (!draft.name.trim()) list.push({ kind: "automation" });
    if (!draft.trigger || triggerIncomplete) list.push({ kind: "trigger" });
    for (const issue of issues)
      list.push(
        issue.kind === "condition"
          ? { kind: "case", branchId: issue.branchId }
          : { kind: "empty", branchId: issue.branchId },
      );
    for (const branchId of liveIncompleteActions)
      list.push({ kind: "action", branchId });
    return list;
  }, [
    draft.name,
    draft.trigger,
    triggerIncomplete,
    issues,
    liveIncompleteActions,
  ]);

  const hasChanges =
    mode.kind === "create" ||
    !sameShape(savedFields(draft), savedFields(baseline));

  const onSaveError = (error: Error) => {
    setServerError(error);
    const detail = serverErrorMessage(error);
    const base = t("toasts.saveError");
    toast.error(detail ? `${base} : ${detail}` : base);
  };

  const create = useMutation({
    mutationFn: (value: Draft) =>
      client.automations.create({
        ...savedFields(value),
        trigger: value.trigger!,
        enabled: value.enabled,
      }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.created"));
      navigate(`/automations/${saved.id}`);
    },
    onError: onSaveError,
  });

  const update = useMutation({
    mutationFn: (value: Draft) =>
      client.automations.update(automation!.id!, {
        ...savedFields(value),
        trigger: value.trigger!,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["automations", saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      const next = draftOf(saved);
      setBaseline(next);
      setDraft(next);
      setIncompleteActions(new Set());
      setServerError(undefined);
      toast.success(t("toasts.updated"));
    },
    onError: onSaveError,
  });

  const isSaving = create.isPending || update.isPending;
  const canSave = canWrite && hasChanges && blockers.length === 0 && !isSaving;

  const save = () => {
    if (!canSave) return;
    (mode.kind === "create" ? create : update).mutate(draft);
  };

  const cancel = () => {
    if (mode.kind === "create") {
      navigate("/automations");
      return;
    }
    setDraft(baseline);
    setIncompleteActions(new Set());
    setTriggerIncomplete(false);
    setServerError(undefined);
    setDraftKey((key) => key + 1);
    setSelection({ kind: "automation" });
  };

  const updateCase = useCallback(
    (
      branchId: string,
      patch: { name?: string; condition?: WriteCondition | null },
    ) => setBranches((branches) => updateCaseIn(branches, branchId, patch)),
    [setBranches],
  );
  const moveCase = useCallback(
    (branchId: string, to: number) =>
      setBranches((branches) => moveCaseTo(branches, branchId, to)),
    [setBranches],
  );
  const removeCase = useCallback(
    (branchId: string) => {
      // A tree never goes empty: its last path waits for an action instead.
      setBranches((branches) => {
        const next = removeBranchFrom(branches, branchId);
        return next.length ? next : emptyTree();
      });
      setIncompleteActions((current) => withoutId(current, branchId));
      setSelection({ kind: "automation" });
    },
    [setBranches],
  );
  /** First valid action on a path that had none. */
  const chooseAction = useCallback(
    (branchId: string, action: Action) => {
      setIncompleteActions((current) => withoutId(current, branchId));
      setBranches((branches) =>
        sameShape(findBranch(branches, branchId)?.branch.action, action)
          ? branches
          : setAction(branches, branchId, action),
      );
    },
    [setBranches],
  );
  /** The action form reports every edit; null means "incomplete for now". */
  const changeAction = useCallback(
    (branchId: string, action: Action | null) => {
      setIncompleteActions((current) =>
        action === null
          ? withId(current, branchId)
          : withoutId(current, branchId),
      );
      if (action)
        setBranches((branches) =>
          sameShape(findBranch(branches, branchId)?.branch.action, action)
            ? branches
            : replaceAction(branches, branchId, action),
        );
    },
    [setBranches],
  );
  const removeAction = useCallback(
    (branchId: string) => {
      setBranches((branches) => removeActionFrom(branches, branchId));
      setIncompleteActions((current) => withoutId(current, branchId));
    },
    [setBranches],
  );
  const setOtherwise = useCallback(
    (levelId: LevelId, action: Action | null) => {
      if (action === null) {
        const level = levelOf(branchesRef.current, levelId);
        const removed = level[otherwiseIndex(level)]?.id;
        if (removed)
          setIncompleteActions((current) => withoutId(current, removed));
      }
      setBranches((branches) => {
        const level = levelOf(branches, levelId);
        const current = level[otherwiseIndex(level)]?.action ?? null;
        return sameShape(current, action)
          ? branches
          : setOtherwiseAt(branches, levelId, action);
      });
    },
    [setBranches],
  );
  const insertCondition = useCallback(
    (target: InsertTarget) => {
      const result = insertConditionAt(
        branchesRef.current,
        target,
        emptyCondition(),
      );
      // The action moves under the new case: its old branch keeps no mark.
      if (target.kind === "terminal")
        setIncompleteActions((current) => withoutId(current, target.branchId));
      setDraft((current) => ({ ...current, branches: result.branches }));
      select({ kind: "case", branchId: result.caseId });
    },
    [select],
  );
  const addCase = useCallback(
    (levelId: LevelId) => {
      const result = addCaseTo(branchesRef.current, levelId, emptyCondition());
      setDraft((current) => ({ ...current, branches: result.branches }));
      select({ kind: "case", branchId: result.caseId });
    },
    [select],
  );

  const canAddBranch =
    countBranches(draft.branches) < MAX_TREE_BRANCHES &&
    treeDepth(draft.branches) < MAX_TREE_DEPTH;

  return {
    mode,
    automation,
    canWrite,
    draft,
    /** The last saved version: what executions ran, and what a replay shows. */
    saved: baseline,
    draftKey,
    serverError,
    hasChanges,
    blockers,
    canSave,
    isSaving,
    save,
    cancel,
    selection,
    select,
    tab,
    setTab: (next: PanelTab) => {
      setTab(next);
      if (next === "configure") setReplayId(null);
    },
    replayId,
    setReplayId,
    incompleteConditions,
    incompleteActions: liveIncompleteActions,
    canAddBranch,

    setName: (name: string) => setDraft((current) => ({ ...current, name })),
    setDescription: (description: string) =>
      setDraft((current) => ({ ...current, description })),
    setEnabled: (enabled: boolean) =>
      setDraft((current) => ({ ...current, enabled })),
    /** A null trigger means "the form is incomplete": keep the last valid one. */
    setTrigger: useCallback((trigger: Trigger | null) => {
      setTriggerIncomplete(trigger === null);
      if (trigger) setDraft((current) => ({ ...current, trigger }));
    }, []),

    insertCondition,
    addCase,
    updateCase,
    moveCase,
    removeCase,
    chooseAction,
    changeAction,
    removeAction,
    setOtherwise,
  };
}

export type AutomationEditorState = ReturnType<typeof useAutomationEditor>;

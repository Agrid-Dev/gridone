import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Ellipsis,
  PanelRightClose,
  PencilLine,
  Plus,
  Split,
  SquareTerminal,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AutomationExecution } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AutomationEditorState } from "../editor/useAutomationEditor";
import { getTriggerDescriptor } from "../presenters/triggerRegistry";
import { caseAt, outcomeAt } from "../tree/model";
import type { Selection } from "../tree/TreeContext";
import { ExecutionsTab } from "./ExecutionsTab";
import {
  AutomationPanel,
  CaseFooter,
  CasePanel,
  DecisionPanel,
  OtherwiseFooter,
  OtherwisePanel,
  OutcomePanel,
  TriggerPanel,
} from "./panels";

const ACTION_ICONS: Record<string, LucideIcon> = {
  command_template: SquareTerminal,
  write_attribute: PencilLine,
  notification: Bell,
};

const TILE_TONES = {
  primary: "bg-primary/10 text-primary",
  decision: "bg-node-decision/10 text-node-decision",
  command: "bg-node-command/10 text-node-command",
  write: "bg-node-write/10 text-node-write",
  notify: "bg-node-notify/10 text-node-notify",
} as const;

const ACTION_TONES: Record<string, keyof typeof TILE_TONES> = {
  command_template: "command",
  write_attribute: "write",
  notification: "notify",
};

function selectionKey(selection: Selection): string {
  switch (selection.kind) {
    case "decision":
    case "otherwise":
      return `${selection.kind}:${selection.levelId}`;
    case "case":
    case "action":
    case "empty":
      // An empty path and the action it gets share one panel (and one form).
      return `outcome-or-case:${selection.kind === "case" ? "case" : "outcome"}:${selection.branchId ?? "root"}`;
    default:
      return selection.kind;
  }
}

type Heading = {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  kicker: string;
  title: string;
  menu?: ReactNode;
};

function useHeading(editor: AutomationEditorState): Heading {
  const { t } = useTranslation("automations");
  const { selection, draft } = editor;
  switch (selection.kind) {
    case "trigger":
      return {
        icon: draft.trigger
          ? getTriggerDescriptor(draft.trigger.provider_id).icon
          : Zap,
        tone: "primary",
        kicker: t("tree.when"),
        title: t("panel.trigger.title"),
      };
    case "decision":
      return {
        icon: Split,
        tone: "decision",
        kicker: t("tree.decision"),
        title: t("panel.decision.title"),
      };
    case "case": {
      const found = caseAt(draft.branches, selection.branchId);
      const ordinal = (found?.index ?? 0) + 1;
      return {
        icon: Split,
        tone: "decision",
        kicker: t("panel.case.kicker", {
          position: ordinal,
          total: found?.decision.cases.length ?? 1,
        }),
        title:
          found?.item.branch.name ||
          t("panel.case.untitled", { position: ordinal }),
        menu: found && editor.canWrite && (
          <CaseMenu editor={editor} branchId={selection.branchId} />
        ),
      };
    }
    case "otherwise":
      return {
        icon: Split,
        tone: "decision",
        kicker: t("tree.otherwise"),
        title: t("panel.otherwise.title"),
      };
    case "action":
    case "empty": {
      const outcome = selection.branchId
        ? outcomeAt(draft.branches, selection.branchId)
        : undefined;
      const provider =
        outcome?.kind === "action" ? outcome.action.provider_id : null;
      return {
        icon: provider ? (ACTION_ICONS[provider] ?? SquareTerminal) : Plus,
        tone: provider ? (ACTION_TONES[provider] ?? "command") : "primary",
        kicker: t("panel.action.kicker"),
        title: provider
          ? t(`actions.types.${provider}`, { defaultValue: provider })
          : t("tree.chooseAction"),
      };
    }
    default:
      return {
        icon: Zap,
        tone: "primary",
        kicker: t("panel.automation.kicker"),
        title: draft.name.trim() || t("editor.untitled"),
      };
  }
}

function CaseMenu({
  editor,
  branchId,
}: {
  editor: AutomationEditorState;
  branchId: string;
}) {
  const { t } = useTranslation("automations");
  const found = caseAt(editor.draft.branches, branchId);
  if (!found) return null;
  const { index, decision } = found;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={t("panel.case.menu")}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={index === 0}
          onSelect={() => editor.moveCase(branchId, index - 1)}
        >
          <ArrowUp aria-hidden />
          {t("panel.case.earlier")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === decision.cases.length - 1}
          onSelect={() => editor.moveCase(branchId, index + 1)}
        >
          <ArrowDown aria-hidden />
          {t("panel.case.later")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => editor.removeCase(branchId)}
        >
          <Trash2 aria-hidden />
          {t("panel.case.remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Body({
  editor,
  onDelete,
  isDeleting,
}: {
  editor: AutomationEditorState;
  onDelete?: () => Promise<unknown>;
  isDeleting?: boolean;
}) {
  const { selection } = editor;
  switch (selection.kind) {
    case "trigger":
      return <TriggerPanel editor={editor} />;
    case "decision":
      return <DecisionPanel editor={editor} levelId={selection.levelId} />;
    case "case":
      return <CasePanel editor={editor} branchId={selection.branchId} />;
    case "otherwise":
      return <OtherwisePanel editor={editor} levelId={selection.levelId} />;
    case "action":
    case "empty":
      return selection.branchId ? (
        <OutcomePanel editor={editor} branchId={selection.branchId} />
      ) : null;
    default:
      return (
        <AutomationPanel
          editor={editor}
          onDelete={onDelete}
          isDeleting={isDeleting}
        />
      );
  }
}

function Footer({ editor }: { editor: AutomationEditorState }) {
  const { selection } = editor;
  if (selection.kind === "case")
    return <CaseFooter editor={editor} branchId={selection.branchId} />;
  if (selection.kind === "otherwise")
    return <OtherwiseFooter editor={editor} levelId={selection.levelId} />;
  return null;
}

/**
 * The side panel: what is selected on the tree, editable in place, or the
 * automation's executions — pick one to replay it on the tree.
 */
export function Inspector({
  editor,
  executions,
  isLoadingExecutions,
  onDelete,
  isDeleting,
  onCollapse,
}: {
  editor: AutomationEditorState;
  executions: AutomationExecution[];
  isLoadingExecutions: boolean;
  onDelete?: () => Promise<unknown>;
  isDeleting?: boolean;
  onCollapse: () => void;
}) {
  const { t } = useTranslation("automations");
  const heading = useHeading(editor);
  const Icon = heading.icon;
  const showTabs = editor.mode.kind === "edit";
  const onExecutions = showTabs && editor.tab === "executions";
  return (
    <aside
      aria-label={t("panel.label")}
      className="flex min-h-[28rem] w-full flex-col border-t bg-card lg:h-full lg:min-h-0 lg:w-[26rem] lg:shrink-0 lg:border-l lg:border-t-0"
    >
      <div className="flex items-start gap-3 px-5 pt-4">
        <span
          aria-hidden
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            TILE_TONES[onExecutions ? "primary" : heading.tone],
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.07em] text-muted-foreground">
            {onExecutions ? t("panel.executions.kicker") : heading.kicker}
          </p>
          <h2 className="truncate font-display text-lg font-semibold leading-7">
            {onExecutions ? t("executions.title") : heading.title}
          </h2>
        </div>
        {!onExecutions && heading.menu}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={t("panel.collapse")}
          onClick={onCollapse}
        >
          <PanelRightClose aria-hidden />
        </Button>
      </div>
      {showTabs && (
        <div
          role="tablist"
          aria-label={t("panel.tabs")}
          className="mt-3 flex gap-5 border-b px-5"
        >
          {(["configure", "executions"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={editor.tab === tab}
              onClick={() => editor.setTab(tab)}
              className={cn(
                "-mb-px border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                editor.tab === tab
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`panel.tab.${tab}`)}
            </button>
          ))}
        </div>
      )}
      <div
        role={showTabs ? "tabpanel" : undefined}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        {onExecutions ? (
          <ExecutionsTab
            executions={executions}
            isLoading={isLoadingExecutions}
            replayId={editor.replayId}
            onReplay={editor.setReplayId}
            branches={editor.saved.branches}
          />
        ) : (
          <div key={`${selectionKey(editor.selection)}:${editor.draftKey}`}>
            <Body editor={editor} onDelete={onDelete} isDeleting={isDeleting} />
          </div>
        )}
      </div>
      {!onExecutions && <Footer editor={editor} />}
    </aside>
  );
}

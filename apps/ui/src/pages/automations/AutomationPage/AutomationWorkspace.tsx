import { type FC, type ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Play, Trash2 } from "lucide-react";
import type { Automation } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InputController } from "@/components/forms/controllers/InputController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { useUser } from "@/hooks/useUser";
import { formatTimeAgo } from "@/lib/utils";
import { AutomationStatusBadge } from "../components/AutomationStatusBadge";
import { StatPill } from "../components/StatPill";
import { executionTime } from "../components/executionsSummary";
import { ExecutionsPanel } from "./components/ExecutionsPanel";
import TriggerForm from "./form/TriggerForm";
import ActionForm from "./form/ActionForm";
import { ActionPresenter } from "./presenters/ActionPresenter";
import { TriggerPresenter } from "./presenters/TriggerPresenter";
import { getTriggerDescriptor } from "./presenters/triggerRegistry";
import { useAutomationExecutions } from "./hooks/useAutomationExecutions";
import { useAutomationWorkspace } from "./hooks/useAutomationWorkspace";

/** The Save button sits outside every sub-form (they are siblings, not nested),
 *  so it targets the identity form by id and that form's submit handler is what
 *  commits the whole page. */
const IDENTITY_FORM_ID = "automation-identity-form";

interface AutomationWorkspaceProps {
  automationId: string;
  automation: Automation;
  onDelete: () => void;
  isDeleting: boolean;
}

/** Screenshot-inspired automation workspace: identity, trigger and action are
 *  editable in place and committed by a single Save, with the run log and the
 *  destructive action alongside. */
const AutomationWorkspace: FC<AutomationWorkspaceProps> = ({
  automationId,
  automation,
  onDelete,
  isDeleting,
}) => {
  const { t } = useTranslation("automations");
  const { t: tCommon } = useTranslation("common");
  const {
    canWrite,
    identityForm,
    draftKey,
    onTriggerChange,
    onActionChange,
    enabled,
    toggle,
    isToggling,
    save,
    cancel,
    isSaving,
    hasChanges,
    canSave,
    serverError,
  } = useAutomationWorkspace(automationId, automation);
  const { executions, isLoading, last, count24h } =
    useAutomationExecutions(automationId);

  const TriggerIcon = getTriggerDescriptor(automation.trigger.provider_id).icon;

  return (
    <section className="space-y-7">
      <nav
        aria-label={t("editPage.breadcrumbLabel")}
        className="flex min-w-0 items-center gap-1 overflow-hidden text-sm text-muted-foreground"
      >
        <Link to="/automations" className="shrink-0 hover:text-foreground">
          {t("title")}
        </Link>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 opacity-50" />
        <span className="truncate font-medium text-foreground">
          {automation.name}
        </span>
      </nav>

      <header className="flex flex-col gap-5 border-b border-border pb-7 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <TriggerIcon aria-hidden className="h-6 w-6" />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate font-display text-3xl font-semibold tracking-tight text-foreground">
                {automation.name}
              </h1>
              <AutomationStatusBadge enabled={enabled} />
              {!isLoading && (
                <StatPill
                  count={count24h}
                  label={t("stats.executions24h", { count: count24h })}
                  icon={Play}
                />
              )}
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {last
                ? t("editPage.lastExecution", {
                    ago: formatTimeAgo(executionTime(last), tCommon),
                  })
                : t("editPage.neverExecuted")}
            </p>
          </div>
        </div>

        {canWrite && (
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-medium">
              {t(enabled ? "enabledBadge" : "disabledBadge")}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={toggle}
              disabled={isToggling}
              // Running/paused is a status, not a brand action — green when on.
              className={enabled ? "bg-success" : undefined}
              aria-label={t(enabled ? "actions.disable" : "actions.enable")}
            />
          </div>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]">
        <div className="space-y-6">
          <WorkspaceCard
            title={t("editPage.identity.title")}
            description={t("editPage.identity.description")}
          >
            <form
              id={IDENTITY_FORM_ID}
              onSubmit={save}
              className="space-y-5"
              noValidate
            >
              <InputController
                name="name"
                control={identityForm.control}
                label={t("fields.name")}
                required
                disabled={!canWrite}
                inputProps={{ className: "h-11 bg-muted/15" }}
              />
              <TextareaController
                name="description"
                control={identityForm.control}
                label={t("fields.description")}
                disabled={!canWrite}
                textareaProps={{ rows: 4, className: "bg-muted/15" }}
              />
            </form>
            <AuthorshipLine automation={automation} />
          </WorkspaceCard>

          <WorkspaceCard
            step={1}
            title={t("editPage.when.title")}
            description={t("editPage.when.description")}
          >
            {canWrite ? (
              <TriggerForm
                key={`trigger-${draftKey}`}
                initialValue={automation.trigger}
                onChange={onTriggerChange}
                onSubmit={() => void save()}
                onCancel={cancel}
                serverError={serverError}
                hideActions
              />
            ) : (
              <TriggerPresenter trigger={automation.trigger} />
            )}
          </WorkspaceCard>

          <WorkspaceCard
            step={2}
            title={t("editPage.then.title")}
            description={t("editPage.then.description")}
          >
            {canWrite ? (
              <ActionForm
                key={`action-${draftKey}`}
                initialValue={automation.action}
                onChange={onActionChange}
                onSubmit={() => void save()}
                onCancel={cancel}
                hideActions
              />
            ) : (
              <ActionPresenter action={automation.action} />
            )}
          </WorkspaceCard>

          {canWrite && (
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
              {hasChanges && (
                <p className="mr-auto text-sm text-muted-foreground">
                  {t("editPage.unsavedChanges")}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={cancel}
                disabled={!hasChanges || isSaving}
              >
                {tCommon("common.cancel")}
              </Button>
              <Button
                type="submit"
                form={IDENTITY_FORM_ID}
                disabled={!canSave || isSaving}
              >
                {isSaving
                  ? tCommon("common.saving")
                  : t("editPage.saveChanges")}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <ExecutionsPanel executions={executions} isLoading={isLoading} />

          {canWrite && (
            <Card className="rounded-2xl border-destructive/30 bg-destructive/5 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold text-destructive">
                    {t("deleteConfirm.title")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("editPage.deleteHint")}
                  </p>
                </div>
                <ConfirmButton
                  variant="outline"
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isDeleting}
                  onConfirm={onDelete}
                  confirmTitle={t("deleteConfirm.title")}
                  confirmDetails={t("deleteConfirm.details", {
                    name: automation.name,
                  })}
                  confirmLabel={t("actions.delete")}
                >
                  <Trash2 aria-hidden />
                  {t("actions.delete")}
                </ConfirmButton>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
};

function WorkspaceCard({
  step,
  title,
  description,
  children,
}: {
  step?: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl p-6 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        {step !== undefined && (
          <span
            aria-hidden
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary"
          >
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </Card>
  );
}

/** Provenance footer of the identity card: who created the automation and when
 *  it last changed. */
function AuthorshipLine({ automation }: { automation: Automation }) {
  const { t } = useTranslation("automations");
  const creator = useUser(automation.created_by);
  const { created_at: createdAt, updated_at: updatedAt } = automation;

  if (!createdAt) return null;

  return (
    <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
      {t("metadata.createdAt")}: {formatMoment(createdAt)}
      {creator && ` · ${t("metadata.createdBy")}: ${creator.username}`}
      {updatedAt &&
        updatedAt !== createdAt &&
        ` · ${t("metadata.updatedAt")}: ${formatMoment(updatedAt)}`}
    </p>
  );
}

function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default AutomationWorkspace;

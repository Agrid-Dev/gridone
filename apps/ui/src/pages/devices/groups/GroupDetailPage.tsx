import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { ControlPanel } from "@/components/device-ui/widgets/ControlPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commandFailureLabel } from "@/lib/commandFailure";
import { formatValue } from "@/lib/formatValue";
import { localize } from "@/lib/localizedText";
import { GroupError } from "./GroupError";
import { GroupCommandDialog } from "./GroupCommandDialog";
import { GroupTargetDialog } from "./GroupTargetDialog";
import { useGroupDetails } from "./useGroupDetails";

export default function GroupDetailPage() {
  const { groupId } = useParams();
  return groupId ? (
    <GroupDetails key={groupId} id={groupId} />
  ) : (
    <NotFoundFallback />
  );
}

function GroupDetails({ id }: { id: string }) {
  const { t, i18n } = useTranslation("devices");
  const detail = useGroupDetails(id);
  const {
    group,
    attributes,
    controls,
    runtime,
    presentation,
    command,
    canWrite,
  } = detail;
  if (group.isLoading) return <p role="status">{t("presentation.loading")}</p>;
  if (!group.data) return <NotFoundFallback />;
  const data = group.data;
  const renderAttributes = (filter?: string) => (
    <dl className="divide-y rounded-lg border px-4">
      {Object.values(attributes)
        .filter((a) => !filter || a.group === filter)
        .map((attribute) => (
          <div
            key={attribute.name}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <dt className="text-muted-foreground">
              {attribute.label
                ? localize(attribute.label, i18n.language)
                : attribute.name}
              {attribute.unit ? ` (${attribute.unit})` : ""}
            </dt>
            <dd className="flex items-center gap-3">
              <span>
                {attribute.state === "common"
                  ? formatValue(attribute.current_value!)
                  : runtime.valueLabel?.(attribute.name)}
              </span>
              {canWrite &&
                !!data.device_ids?.length &&
                attribute.read_write_modes.includes("write") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={command.busy || !!command.preview}
                    onClick={() => detail.choose(attribute.name)}
                  >
                    {t("groups.chooseTarget")}
                  </Button>
                )}
            </dd>
          </div>
        ))}
    </dl>
  );
  const fallback = (
    <div className="space-y-5">
      <ControlPanel
        controls={Object.keys(controls)}
        runtime={runtime}
        language={i18n.language}
      />
      {renderAttributes()}
    </div>
  );
  return (
    <section className="space-y-6">
      <Link
        to="/devices/groups"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {t("groups.title")}
      </Link>
      <ResourceHeader
        title={data.name}
        caption={
          <>
            {t("groups.groupHeader", {
              count: data.device_ids?.length ?? 0,
              driver: data.driver_id,
            })}
            {data.description && <p>{data.description}</p>}
          </>
        }
        actions={
          canWrite && (
            <>
              <Button asChild variant="outline">
                <Link to={`/devices/groups/${id}/edit`}>
                  <Pencil />
                  {t("groups.edit")}
                </Link>
              </Button>
              <Button
                variant="outline"
                aria-label={t("groups.delete")}
                onClick={() => detail.setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </>
          )
        }
      />
      <GroupError
        error={
          group.error ||
          detail.members.error ||
          detail.driver.error ||
          (!command.preview && command.error)
        }
      />
      {!data.device_ids?.length ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t("groups.empty")}
        </p>
      ) : presentation.loading ? (
        <p role="status">{t("presentation.loading")}</p>
      ) : presentation.document &&
        presentation.assets &&
        !presentation.assets.missing.length ? (
        <DevicePresentation
          document={presentation.document}
          subject={{ id, attributes }}
          runtime={runtime}
          assetUrl={presentation.assets.assetUrl}
          glyphSet={presentation.assets.glyphSet}
          fallback={fallback}
          renderAttributes={({ group: filter }) => renderAttributes(filter)}
        />
      ) : (
        fallback
      )}
      {!!command.batch && (
        <div role="status" className="space-y-3 rounded-lg border p-4">
          <p className="font-medium">
            {t("groups.batchSummary", {
              success: command.commands.filter((c) => c.status === "success")
                .length,
              failed: command.commands.filter((c) => c.status === "error")
                .length,
              pending: command.commands.filter((c) => c.status === "pending")
                .length,
            })}
          </p>
          <GroupError error={command.resultsError} />
          <ul className="max-h-64 overflow-auto text-sm">
            {command.commands.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-1">
                <span>
                  {detail.members.devices.find((d) => d.id === item.device_id)
                    ?.name ?? item.device_id}
                </span>
                <span>
                  {t(`commands.statusLabels.${item.status}`, {
                    defaultValue: item.status,
                  })}
                  {item.status === "error" &&
                    ` · ${commandFailureLabel(t, item.status_details)}`}
                </span>
              </li>
            ))}
          </ul>
          <Link
            className="text-sm underline"
            to={`/devices/commands?batch_id=${encodeURIComponent(command.batch.batch_id)}`}
          >
            {t("groups.history")}
          </Link>
        </div>
      )}
      <details open className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          {t("groups.members")}
        </summary>
        <ul className="mt-3 divide-y">
          {detail.members.devices.map((member) => (
            <li key={member.id} className="py-2 text-sm">
              <Link className="hover:underline" to={`/devices/${member.id}`}>
                {member.name}
              </Link>
            </li>
          ))}
        </ul>
      </details>
      <GroupCommandDialog command={command} />
      {detail.chosen && attributes[detail.chosen] && (
        <GroupTargetDialog
          key={detail.chosen}
          attribute={attributes[detail.chosen]}
          onCancel={() => detail.setChosen(null)}
          onPrepare={(value) => {
            const name = detail.chosen!;
            detail.setChosen(null);
            void command.prepare(name, value);
          }}
        />
      )}
      <Dialog open={detail.deleting} onOpenChange={detail.setDeleting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groups.delete")}</DialogTitle>
            <DialogDescription>
              {t("groups.deleteDescription", { name: data.name })}
            </DialogDescription>
          </DialogHeader>
          <GroupError error={detail.remove.error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => detail.setDeleting(false)}>
              {t("groups.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={detail.remove.isPending}
              onClick={() => detail.remove.mutate()}
            >
              {t("groups.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

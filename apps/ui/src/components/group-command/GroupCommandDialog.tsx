import { commandReasons } from "@/lib/commandReasons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { cn } from "@/lib/utils";
import { localize } from "@/lib/localizedText";
import { GroupError, groupConflict } from "./GroupError";
import { GroupCommandResults } from "./GroupCommandResults";
import {
  canConfirmPreparation,
  type GroupCommandPreparation,
  type useGroupCommand,
} from "./useGroupCommand";

type GroupCommand = ReturnType<typeof useGroupCommand>;

export function GroupCommandDialog({
  command,
  targetName,
}: {
  command: GroupCommand;
  /** Human name of the target. Absent, the dialog uses a neutral title — it
   *  never falls back to the tag that resolves the recipients. */
  targetName?: string;
}) {
  const { t, i18n } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const { preview, preparations, busy } = command;
  const multiple = preparations.length > 1;
  const pending = preparations.filter(canConfirmPreparation);
  const complete =
    command.batches.length > 0 &&
    preparations.every(
      (item) =>
        item.batch ||
        (item.preview && !item.needsRefresh && !item.selected.length),
    );
  const first = preparations[0];
  const firstPreview = first?.preview;
  return (
    <Dialog
      open={!!preview}
      onOpenChange={(open) => {
        if (!open) command.cancel();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {complete
              ? t("groups.resultsTitle")
              : targetName
                ? t("groups.previewTitle", { name: targetName })
                : t("groups.previewManyTitle")}
          </DialogTitle>
          <DialogDescription>
            {complete
              ? t("groups.resultsDescription")
              : multiple
                ? t("groups.previewManyDescription", {
                    count: preparations.length,
                  })
                : t("groups.previewDescription", {
                    attribute: firstPreview?.attribute_label
                      ? localize(firstPreview.attribute_label, i18n.language)
                      : first?.write.attribute,
                    value: first
                      ? `${attributeValueText(first.write.attribute, first.write.value, tCommon)}${firstPreview?.unit ? ` ${firstPreview.unit}` : ""}`
                      : "",
                    count: first?.selected.length ?? 0,
                  })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {preparations.map((item) => (
            <PreparedWrite
              key={item.write.attribute}
              item={item}
              command={command}
              showTitle={multiple}
            />
          ))}
        </div>
        <GroupCommandResults command={command} targetName={targetName} />
        {!complete && (
          <p className="text-xs text-muted-foreground">
            {t("groups.liveValidation")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={command.cancel} disabled={busy}>
            {t(
              command.successfulWrites.length
                ? "groups.close"
                : "groups.cancel",
            )}
          </Button>
          {(!complete || command.sending) && (
            <Button
              onClick={() => void command.confirm()}
              disabled={busy || !pending.length}
            >
              {command.sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("groups.sending")}
                </>
              ) : multiple ? (
                t("groups.applyWrites", { count: pending.length })
              ) : (
                t("groups.apply", { count: pending[0]?.selected.length ?? 0 })
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreparedWrite({
  item,
  command,
  showTitle,
}: {
  item: GroupCommandPreparation;
  command: GroupCommand;
  showTitle: boolean;
}) {
  const { t, i18n } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const { preview, selected } = item;
  const attribute = preview?.attribute_label
    ? localize(preview.attribute_label, i18n.language)
    : item.write.attribute;
  const target = attributeValueText(
    item.write.attribute,
    item.write.value,
    tCommon,
  );
  const value = `${target}${preview?.unit ? ` ${preview.unit}` : ""}`;
  return (
    <section aria-label={attribute} className="space-y-3">
      {showTitle && (
        <div>
          <h3 className="font-semibold">{attribute}</h3>
          <p className="text-sm text-muted-foreground">
            {t("groups.previewDescription", {
              attribute,
              value,
              count: selected.length,
            })}
          </p>
        </div>
      )}
      {item.batch ? (
        <div className="rounded-md border bg-muted/50 p-3 text-sm">
          <p role="status">{t("groups.writeAccepted", { attribute, value })}</p>
        </div>
      ) : (
        <>
          {item.changed && (
            <p
              role="alert"
              className="rounded-md border border-amber-400 p-3 text-sm"
            >
              {t("groups.previewChanged")}
            </p>
          )}
          {item.uncertain ? (
            <div
              role="alert"
              className="rounded-md border border-amber-400 p-3 text-sm"
            >
              <p>
                {t(
                  groupConflict(item.error)
                    ? "groups.confirmationExpired"
                    : "groups.confirmationUncertain",
                )}
              </p>
              <Link className="underline" to="/devices/commands">
                {t("groups.history")}
              </Link>
            </div>
          ) : (
            <GroupError error={item.error} />
          )}
          {item.needsRefresh && (
            <Button
              variant="outline"
              disabled={command.busy}
              onClick={() => void command.retryPreview(item.write.attribute)}
            >
              {t("groups.retryPreview")}
            </Button>
          )}
          {!preview && command.busy && (
            <p role="status">{t("presentation.loading")}</p>
          )}
          {preview && (
            <div className="max-h-96 overflow-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "",
                      t("groups.members"),
                      t("groups.before"),
                      t("groups.after"),
                    ].map((label, i) => (
                      <th key={i} className="p-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.members.map((row) => (
                    <tr
                      key={row.device_id}
                      data-eligible={row.eligible}
                      className={cn(!row.eligible && "text-muted-foreground")}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={row.name}
                          checked={selected.includes(row.device_id)}
                          disabled={
                            (!row.eligible && !row.consent_required) ||
                            command.busy ||
                            item.needsRefresh ||
                            item.uncertain
                          }
                          onChange={(event) =>
                            command.setSelected(
                              event.target.checked
                                ? [...selected, row.device_id]
                                : selected.filter((id) => id !== row.device_id),
                              item.write.attribute,
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Link
                          className="hover:underline"
                          to={`/devices/${row.device_id}`}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="p-3">
                        {row.current_value == null
                          ? t("groups.values.unavailable")
                          : attributeValueText(
                              item.write.attribute,
                              row.current_value,
                              tCommon,
                            )}
                      </td>
                      {/* An excluded member keeps its row and says why, in
                          place of a value it will not receive: the server
                          refuses a confirmation that selects it. */}
                      <td className="p-3 font-medium">
                        {row.eligible ? (
                          target
                        ) : (
                          <span className="font-normal">
                            {/* A driver authors its own refusals; the app
                                catalog names the built-in codes. */}
                            {commandReasons(
                              row.reasons?.length
                                ? row.reasons
                                : [{ code: "not_writable" }],
                            )}
                          </span>
                        )}
                        {row.user_confirmation && (
                          <p className="mt-2 whitespace-pre-wrap font-normal text-amber-700">
                            {localize(row.user_confirmation, i18n.language)}
                          </p>
                        )}
                        {!!row.warnings?.length && (
                          <p
                            role="status"
                            className="font-normal text-muted-foreground"
                          >
                            {commandReasons(row.warnings)}
                          </p>
                        )}
                        {row.consent_required && (
                          <p className="mt-2 text-amber-700 font-normal">
                            {t("confirmation.unknownOperatingRule")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

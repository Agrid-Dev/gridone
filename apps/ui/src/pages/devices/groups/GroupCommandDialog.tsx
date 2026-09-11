import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatValue } from "@/lib/formatValue";
import { localize } from "@/lib/localizedText";
import { GroupError } from "./GroupError";
import type { useGroupCommand } from "./useGroupCommand";

export function GroupCommandDialog({
  command,
}: {
  command: ReturnType<typeof useGroupCommand>;
}) {
  const { t, i18n } = useTranslation("devices");
  const { preview, selected, setSelected, busy } = command;
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
            {t("groups.previewTitle", { name: preview?.group_name })}
          </DialogTitle>
          <DialogDescription>
            {t("groups.previewDescription", {
              attribute: preview?.attribute_label
                ? localize(preview.attribute_label, i18n.language)
                : preview?.attribute,
              value: preview
                ? `${formatValue(preview.value)}${preview.unit ? ` ${preview.unit}` : ""}`
                : "",
              count: selected.length,
            })}
          </DialogDescription>
        </DialogHeader>
        {command.changed && (
          <p
            role="alert"
            className="rounded-md border border-amber-400 p-3 text-sm"
          >
            {t("groups.previewChanged")}
          </p>
        )}
        <GroupError error={command.error} />
        <div className="max-h-96 overflow-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {[
                  "",
                  t("groups.members"),
                  t("groups.before"),
                  t("groups.after"),
                  t("groups.eligibility"),
                  t("groups.constraints"),
                ].map((label, i) => (
                  <th key={i} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview?.members.map((row) => (
                <tr key={row.device_id}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={row.name}
                      checked={selected.includes(row.device_id)}
                      disabled={!row.eligible || busy}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, row.device_id]
                            : selected.filter((id) => id !== row.device_id),
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
                      : formatValue(row.current_value)}
                  </td>
                  <td className="p-3 font-medium">
                    {formatValue(preview.value)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {row.reason
                      ? t(`groups.reasons.${row.reason}`)
                      : t("groups.reasons.eligible")}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {row.constraints ? (
                      <ul>
                        {(["minimum", "maximum", "step"] as const).map((key) =>
                          row.constraints?.[key] != null ? (
                            <li key={key}>
                              {t(`groups.limits.${key}`, {
                                value: row.constraints[key],
                              })}
                            </li>
                          ) : row.constraints?.unknown?.includes(key) ? (
                            <li key={key}>
                              {t(`groups.limits.${key}`, {
                                value: t("groups.values.unavailable"),
                              })}
                            </li>
                          ) : null,
                        )}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("groups.liveValidation")}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={command.cancel} disabled={busy}>
            {t("groups.cancel")}
          </Button>
          <Button
            onClick={() => void command.confirm()}
            disabled={busy || !selected.length}
          >
            {t("groups.apply", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

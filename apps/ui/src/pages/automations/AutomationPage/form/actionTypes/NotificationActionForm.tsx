import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import UserPicker from "@/components/forms/resourcePickers/UserPicker";
import { SeverityChip } from "@/components/SeverityChip";
import { SEVERITIES, type Severity } from "@/lib/severity";
import type { CustomActionFormProps } from "../../presenters/types";

type NotificationDraft = {
  title: string;
  body: string;
  severity: Severity;
  userIds: string[];
};

const DEFAULT_DRAFT: NotificationDraft = {
  title: "",
  body: "",
  severity: "info",
  userIds: [],
};

/** Read a saved notification action back into the editable draft. Anything
 *  that doesn't match the ``notification`` shape falls back to defaults. */
function readInitialDraft(
  initialValue: CustomActionFormProps["initialValue"],
): NotificationDraft {
  if (initialValue?.provider_id !== "notification") return DEFAULT_DRAFT;
  const {
    title,
    body,
    severity,
    user_ids: userIds,
  } = initialValue.params ?? {};
  return {
    title: typeof title === "string" ? title : "",
    body: typeof body === "string" ? body : "",
    severity: SEVERITIES.includes(severity as Severity)
      ? (severity as Severity)
      : "info",
    userIds: Array.isArray(userIds)
      ? userIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/** A draft is dispatchable only with a non-empty title and at least one
 *  recipient — the backend rejects an empty ``user_ids`` list. */
function toResult(draft: NotificationDraft) {
  if (!draft.title.trim() || draft.userIds.length === 0) return null;
  return {
    provider_id: "notification" as const,
    params: {
      title: draft.title,
      body: draft.body,
      severity: draft.severity,
      user_ids: draft.userIds,
    },
  };
}

/** Body for the ``notification`` action type. Lets the user compose the
 *  title, body and severity of the notification dispatched when the
 *  automation fires, and pick its recipients. */
export const NotificationActionForm: FC<CustomActionFormProps> = ({
  initialValue,
  onChange,
}) => {
  const { t } = useTranslation("automations");
  const [draft, setDraft] = useState<NotificationDraft>(() =>
    readInitialDraft(initialValue),
  );

  const update = (patch: Partial<NotificationDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(toResult(next));
  };

  return (
    <div className="space-y-4">
      <FieldShell
        id="notification-title"
        label={t("actions.notificationForm.title")}
        required
      >
        <Input
          id="notification-title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t("actions.notificationForm.titlePlaceholder")}
        />
      </FieldShell>

      <FieldShell
        id="notification-body"
        label={t("actions.notificationForm.body")}
      >
        <Textarea
          id="notification-body"
          value={draft.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder={t("actions.notificationForm.bodyPlaceholder")}
        />
      </FieldShell>

      <FieldShell
        id="notification-severity"
        label={t("actions.notificationForm.severity")}
      >
        <Select
          value={draft.severity}
          onValueChange={(severity) =>
            update({ severity: severity as Severity })
          }
        >
          <SelectTrigger id="notification-severity" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((severity) => (
              <SelectItem key={severity} value={severity}>
                <SeverityChip severity={severity} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>

      <UserPicker
        id="notification-recipients"
        label={t("actions.notificationForm.recipients")}
        required
        value={draft.userIds}
        onChange={(userIds) => update({ userIds })}
      />
    </div>
  );
};

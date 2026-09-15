import { isGridoneError } from "@gridone/sdk";
import { z } from "zod";
import { useTranslation } from "react-i18next";

const conflictSchema = z.object({ code: z.string() });
export function groupConflict(error: unknown) {
  if (!isGridoneError(error)) return null;
  const result = conflictSchema.safeParse(error.rawDetail);
  return result.success ? result.data : null;
}
export function GroupError({ error }: { error: unknown }) {
  const { t } = useTranslation("devices");
  if (!error) return null;
  const conflict = groupConflict(error);
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      {conflict
        ? t(`groups.errors.${conflict.code}`, {
            defaultValue: t("groups.errors.failed"),
          })
        : t("groups.errors.failed")}
    </p>
  );
}

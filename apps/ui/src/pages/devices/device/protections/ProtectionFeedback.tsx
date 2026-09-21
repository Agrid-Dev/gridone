import { isGridoneError, type WriteReason } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { commandReasons } from "@/lib/commandReasons";
import { isConflict } from "./useProtections";

export function ProtectionDiagnostics({
  reasons,
}: {
  reasons?: WriteReason[];
}) {
  const { i18n } = useTranslation("protections");
  return reasons?.length ? (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {commandReasons(reasons, i18n.language)}
    </p>
  ) : null;
}

export function ProtectionError({ error }: { error: unknown }) {
  const { t } = useTranslation("protections");
  if (!error) return null;
  if (isGridoneError(error) && error.reasons?.length)
    return <ProtectionDiagnostics reasons={error.reasons} />;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(
        isConflict(error)
          ? "conflict"
          : isGridoneError(error) && error.status === 422
            ? "invalidDefinition"
            : "failed",
      )}
    </p>
  );
}

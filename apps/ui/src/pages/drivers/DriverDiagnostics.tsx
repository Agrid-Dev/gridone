import { useTranslation } from "react-i18next";
import type { PackageDiagnostic } from "./packageDiagnostics";

export function DriverDiagnostics({
  diagnostics,
}: {
  diagnostics: PackageDiagnostic[];
}) {
  const { t } = useTranslation("drivers");
  if (diagnostics.length === 0) return null;
  return (
    <div role="alert" className="space-y-2">
      <p className="font-medium">{t("package.diagnostics")}</p>
      <ul className="space-y-3 text-sm">
        {diagnostics.map((diagnostic, index) => (
          <li key={index} className="space-y-1 break-words">
            <p>
              <code>{diagnostic.code}</code>
              {diagnostic.path && (
                <>
                  {" "}
                  — <code>{diagnostic.path}</code>
                </>
              )}
            </p>
            {diagnostic.line != null && (
              <p>
                {t("package.line", { line: diagnostic.line })}
                {diagnostic.column != null && (
                  <> · {t("package.column", { column: diagnostic.column })}</>
                )}
              </p>
            )}
            <p>{diagnostic.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

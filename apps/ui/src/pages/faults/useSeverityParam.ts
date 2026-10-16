import { useSearchParams } from "react-router";
import type { Severity } from "@gridone/sdk";
import { SEVERITIES } from "@/lib/severity";

/** The severity an alerts view is filtered on, kept in `?severity=` so a
 *  copied link keeps it. Picking the selected severity again clears it. */
export function useSeverityParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("severity");
  const severity = SEVERITIES.find((value) => value === raw);
  const setSeverity = (value?: Severity) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== severity) next.set("severity", value);
        else next.delete("severity");
        return next;
      },
      { replace: true },
    );
  return { severity, setSeverity };
}

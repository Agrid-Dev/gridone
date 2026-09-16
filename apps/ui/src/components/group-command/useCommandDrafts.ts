import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scalar } from "@/components/device-ui/conditions";
import type { GroupCommandWrite } from "./useGroupCommand";

/**
 * Setpoints staged locally, one absolute target per attribute, before the
 * command they compose is previewed and confirmed. Staging is what a tag
 * target requires: the API refuses a one-shot write to a filter carrying
 * tags, so every gesture becomes an intention until the user validates.
 */
export function useCommandDrafts(
  successfulWrites: readonly GroupCommandWrite[],
) {
  const [drafts, setDrafts] = useState<Record<string, Scalar>>({});
  const stage = useCallback((attribute: string, value: Scalar) => {
    setDrafts((current) =>
      current[attribute] === value
        ? current
        : { ...current, [attribute]: value },
    );
  }, []);
  const removeDraft = useCallback((attribute: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[attribute];
      return next;
    });
  }, []);
  const clearDrafts = useCallback(() => setDrafts({}), []);
  // Successful sends are removed even if another instruction fails. Retrying
  // the remaining drafts must never send an already accepted instruction again.
  useEffect(() => {
    if (!successfulWrites.length) return;
    setDrafts((current) => {
      const accepted = successfulWrites.filter(
        (write) =>
          Object.hasOwn(current, write.attribute) &&
          current[write.attribute] === write.value,
      );
      if (!accepted.length) return current;
      const next = { ...current };
      for (const write of accepted) delete next[write.attribute];
      return next;
    });
  }, [successfulWrites]);
  const writes = useMemo(
    () =>
      Object.entries(drafts).map(([attribute, value]) => ({
        attribute,
        value,
      })),
    [drafts],
  );
  return { drafts, writes, stage, removeDraft, clearDrafts };
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTemplate,
  updateTemplate,
  type AttributeWrite,
  type CommandTemplate,
} from "@/api/commands";
import type { DevicesFilter } from "@/api/devices";

export type CommandTemplateCommitArgs = {
  target: DevicesFilter;
  write: AttributeWrite;
  /** ``string`` saves a named template, ``null`` keeps it ephemeral. */
  name: string | null;
};

export type UseCommandTemplateArgs = {
  /** Existing template id to PATCH. ``undefined`` (the default) means the
   *  first ``commit`` POSTs a new template; subsequent commits PATCH the
   *  resolved row. */
  initialId?: string;
};

/** Owns a command template's lifecycle: creates it on first commit,
 *  patches it on subsequent commits. The resolved id is tracked
 *  internally so callers don't have to thread it back into the hook —
 *  re-saves "just work". */
export function useCommandTemplate({ initialId }: UseCommandTemplateArgs = {}) {
  const queryClient = useQueryClient();
  const [resolvedId, setResolvedId] = useState<string | undefined>(initialId);

  const mutation = useMutation<
    CommandTemplate,
    Error,
    CommandTemplateCommitArgs
  >({
    mutationFn: async ({ target, write, name }) => {
      if (resolvedId) {
        return updateTemplate(resolvedId, { target, write, name });
      }
      return createTemplate({ target, write, name });
    },
    onSuccess: (template) => {
      setResolvedId(template.id);
      queryClient.invalidateQueries({ queryKey: ["command-templates"] });
    },
  });

  return {
    /** Commit the current payload. Returns the resolved template (with its
     *  id stamped) — caller acts on ``template.id``. */
    commit: (args: CommandTemplateCommitArgs) => mutation.mutateAsync(args),
    resolvedId,
    isCommitting: mutation.isPending,
    error: mutation.error,
  };
}

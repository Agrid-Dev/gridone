import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dispatchTemplate } from "@/api/commands";

export type DispatchResult = { batchId: string };

/** Slim mutations surface for the wizard's dispatch button. With the
 *  wizard owning template materialization, dispatches always go through a
 *  templateId — the standalone wizard's "Dispatch" path commits as
 *  ephemeral first and then fires this. */
export function useCommandMutations() {
  const queryClient = useQueryClient();

  const dispatch = useMutation<DispatchResult, Error, string>({
    mutationFn: async (templateId) => {
      const res = await dispatchTemplate(templateId);
      return { batchId: res.batchId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commands"] });
    },
  });

  return {
    dispatchTemplate: (templateId: string) => dispatch.mutateAsync(templateId),
    isDispatching: dispatch.isPending,
    dispatchError: dispatch.error,
  };
}

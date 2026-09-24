import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Automation } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

const schema = z.object({ reason: z.string().trim() });

export function useAutomationControl(automation: Automation) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });
  const mutation = useMutation({
    mutationFn: (reason: string) =>
      automation.enabled
        ? client.automations.disable(automation.id!, reason || undefined)
        : client.automations.enable(automation.id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      setOpen(false);
      form.reset();
    },
  });
  return {
    open,
    setOpen,
    form,
    mutation,
    submit: form.handleSubmit(({ reason }) => mutation.mutate(reason)),
  };
}

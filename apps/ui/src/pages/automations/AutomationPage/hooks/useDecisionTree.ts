import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Action, AutomationBranch } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useAutomationCatalog() {
  const client = useGridoneClient();
  const { data: devices = [] } = useQuery({
    queryKey: ["devices", undefined],
    queryFn: () => client.devices.list(),
    staleTime: 10_000,
  });
  return { devices };
}

export function useDecisionTree(
  branches: AutomationBranch[],
  onChange?: (branches: AutomationBranch[]) => void,
) {
  const [editing, setEditing] = useState<number | null>(null);
  const move = (index: number, offset: number) => {
    const next = [...branches];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange?.(next);
  };
  const save = (branch: AutomationBranch) => {
    if (editing === null) return;
    onChange?.(
      editing === branches.length
        ? [...branches, branch]
        : branches.map((item, i) => (i === editing ? branch : item)),
    );
    setEditing(null);
  };
  return {
    editing,
    setEditing,
    move,
    save,
    remove: (index: number) =>
      onChange?.(branches.filter((_, i) => i !== index)),
  };
}

export function useAutomationSchema() {
  const client = useGridoneClient();
  return useQuery({
    queryKey: ["automations", "schema"],
    queryFn: () => client.automations.schema(),
    staleTime: Infinity,
  });
}

export function useBranchForm(
  schema: Record<string, unknown>,
  initial?: AutomationBranch,
) {
  const branchSchema = useMemo(
    () =>
      z.fromJSONSchema({
        $ref: "#/$defs/AutomationBranch",
        $defs: schema.$defs as Record<string, z.core.JSONSchema.JSONSchema>,
      }) as z.ZodType<AutomationBranch, AutomationBranch>,
    [schema],
  );
  const form = useForm<AutomationBranch>({
    resolver: zodResolver(branchSchema),
    mode: "onChange",
    defaultValues: initial ?? {
      name: "",
      condition: null,
      action: { provider_id: "command_template", params: {} },
    },
  });
  const [actionValid, setActionValid] = useState(Boolean(initial));
  const onActionChange = useCallback(
    (action: Action | null) => {
      setActionValid(action !== null);
      if (action)
        form.setValue("action", action, {
          shouldDirty: true,
          shouldValidate: true,
        });
    },
    [form],
  );
  return { form, actionValid, onActionChange };
}

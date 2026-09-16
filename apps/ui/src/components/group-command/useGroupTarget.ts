import { useCallback, useState } from "react";
import type { ConditionJudge } from "@/components/device-ui/conditions";
import type { ControlSpec } from "@/components/device-ui/runtime";
import type { DevicesFilter } from "@/lib/devices";
import type { GroupAttribute } from "./groupAttributes";
import { useCommandDrafts } from "./useCommandDrafts";
import { useGroupCommand } from "./useGroupCommand";
import { useGroupRuntime } from "./useGroupRuntime";

/**
 * Everything needed to command a set of devices resolved by a filter: a
 * runtime whose gestures stage setpoints instead of writing, the staged
 * drafts, and the preview/confirm state machine they are sent through.
 *
 * It knows nothing about where the filter comes from — a group page card or
 * a group picked from one device's page both compose it the same way.
 */
export function useGroupTarget(
  filter: DevicesFilter,
  attributes: Record<string, GroupAttribute>,
  controls: Record<string, ControlSpec>,
  canWrite: boolean,
  judge?: ConditionJudge,
) {
  const command = useGroupCommand(filter);
  const { drafts, writes, stage, removeDraft, clearDrafts } = useCommandDrafts(
    command.successfulWrites,
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const choose = useCallback((attribute: string) => setChosen(attribute), []);
  // A preview freezes its recipients and its bindings: staging more while it
  // is open would describe a command nobody reviewed.
  const runtime = useGroupRuntime(
    attributes,
    controls,
    canWrite && !command.busy && !command.preview,
    stage,
    choose,
    drafts,
    judge,
  );
  return {
    command,
    runtime,
    drafts,
    writes,
    stage,
    removeDraft,
    clearDrafts,
    chosen,
    setChosen,
    choose,
  };
}

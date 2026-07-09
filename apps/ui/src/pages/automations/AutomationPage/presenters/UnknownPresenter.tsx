import { CircleQuestionMark } from "lucide-react";
import type { Trigger } from "@gridone/sdk";
import type { TriggerDescriptor } from "./types";

export const UnknownPresenter = ({ trigger }: { trigger: Trigger }) => {
  if (!import.meta.env.DEV) return null;
  return (
    <pre className="overflow-x-auto text-xs text-muted-foreground">
      {JSON.stringify(trigger, null, 2)}
    </pre>
  );
};

export const unknownTriggerDescriptor: TriggerDescriptor = {
  icon: CircleQuestionMark,
  Presenter: UnknownPresenter,
};

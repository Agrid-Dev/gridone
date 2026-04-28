import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { Trigger } from "@/api/automations";

export type TriggerDescriptor = {
  icon: LucideIcon;
  Presenter: ComponentType<{ trigger: Trigger }>;
};

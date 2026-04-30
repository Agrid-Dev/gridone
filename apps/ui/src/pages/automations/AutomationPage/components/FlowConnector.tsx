import { ChevronDown } from "lucide-react";

export default function FlowConnector() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <div className="flex flex-col items-center text-muted-foreground/50">
        <div className="h-10 w-px border-l border-dashed border-current" />
        <ChevronDown className="-mt-1 h-4 w-4" strokeWidth={2.5} />
      </div>
    </div>
  );
}

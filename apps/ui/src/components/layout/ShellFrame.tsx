import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePageLayout } from "./PageLayout";
import { ShellNavigation } from "./ShellNavigation";

/** The sidebar and top bar around the content, stepping aside while a
 *  page has asked for the whole window (`useFocusedPage`). */
export function ShellFrame({ children }: { children: ReactNode }) {
  const { focused } = usePageLayout();
  return (
    <>
      {!focused && <ShellNavigation />}
      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-col",
          !focused && "pt-16 lg:ml-64",
        )}
      >
        {children}
      </div>
    </>
  );
}

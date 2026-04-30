import { FC, ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PresenterColor = "primary" | "secondary";

interface BasePresenterProps {
  title: ReactNode;
  icon: LucideIcon;
  children: ReactNode;
  color?: PresenterColor;
}

const ICON_CLASSES: Record<PresenterColor, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
};

const BORDER_CLASSES: Record<PresenterColor, string> = {
  primary: "border-l-primary",
  secondary: "border-l-secondary",
};

export const TitlePresenter: FC<
  Pick<BasePresenterProps, "title" | "icon" | "color">
> = ({ title, icon: Icon, color = "primary" }) => (
  <div className="flex items-center gap-2 ">
    <span
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md",
        ICON_CLASSES[color],
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
    <span className="text-sm font-semibold text-foreground/90">{title}</span>
  </div>
);

const BasePresenter: FC<BasePresenterProps> = ({
  children,
  color = "primary",
  ...props
}) => (
  <div>
    <TitlePresenter {...props} color={color} />
    <div className={cn("pl-4 border-l-2 mt-4", BORDER_CLASSES[color])}>
      {children}
    </div>
  </div>
);

export default BasePresenter;

import { FC, ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface BasePresenterProps {
  title: ReactNode;
  icon: LucideIcon;
  children: ReactNode;
}

const BasePresenter: FC<BasePresenterProps> = ({
  title,
  icon: Icon,
  children,
}) => (
  <div>
    <div className="flex items-center gap-2 mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-semibold text-foreground/90">{title}</span>
    </div>
    <div className="pl-4 border-l-2 border-l-primary">{children}</div>
  </div>
);

export default BasePresenter;

import { FC, ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface BasePresenterProps {
  title: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
}

export const TitlePresenter: FC<Pick<BasePresenterProps, "title" | "icon">> = ({
  title,
  icon: Icon,
}) => (
  <div className="flex items-center gap-2 ">
    {Icon && (
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
    )}
    <span className="text-sm font-semibold text-foreground/90">{title}</span>
  </div>
);

const BasePresenter: FC<BasePresenterProps> = ({ children, ...props }) => (
  <div>
    <TitlePresenter {...props} />
    <div className="pl-4 border-l-2 border-l-primary mt-4">{children}</div>
  </div>
);

export default BasePresenter;

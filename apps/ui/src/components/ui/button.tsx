import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

export type ButtonVariants = "default" | "ghost" | "outline";
export type ButtonSizes = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariants;
  size?: ButtonSizes;
}

const sizeStyles: Record<ButtonSizes, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

const variantStyles: Record<ButtonVariants, string> = {
  default:
    "bg-slate-900 text-slate-50 hover:bg-slate-800 focus-visible:outline-slate-900 transition-colors",
  ghost:
    "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400 transition-colors",
  outline:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 focus-visible:outline-slate-400 transition-colors",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", type = "button", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-md font-medium shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50";

    return (
      <button
        ref={ref}
        type={type}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

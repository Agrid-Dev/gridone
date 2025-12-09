import { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface SliderProps extends InputHTMLAttributes<HTMLInputElement> {
  min?: number;
  max?: number;
  step?: number;
}

export function Slider({ className, ...props }: SliderProps) {
  return (
    <input
      type="range"
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-colors [&::-webkit-slider-thumb]:hover:bg-slate-800",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-slate-900 [&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:transition-colors [&::-moz-range-thumb]:hover:bg-slate-800",
        className,
      )}
      {...props}
    />
  );
}

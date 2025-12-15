import * as React from "react"

import { cn } from "@/lib/utils"

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      value = [0],
      onValueChange,
      min = 0,
      max = 100,
      step = 1,
      disabled,
      ...props
    },
    ref
  ) => {
    const currentValue = value[0] ?? min

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value)
      if (onValueChange) {
        onValueChange([newValue])
      }
    }

    const percentage = ((currentValue - min) / (max - min)) * 100

    return (
      <div
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className
        )}
      >
        <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute h-full bg-primary transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            "absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0",
            disabled && "cursor-not-allowed"
          )}
          ref={ref}
          {...props}
        />
        <div
          className={cn(
            "pointer-events-none absolute block h-5 w-5 -translate-x-1/2 rounded-full border-2 border-primary bg-background ring-offset-background transition-all",
            disabled && "opacity-50"
          )}
          style={{ left: `${percentage}%` }}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }

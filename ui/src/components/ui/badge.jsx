import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import * as React from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
        outline: 'text-foreground',
        success: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const Badge = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge, badgeVariants }

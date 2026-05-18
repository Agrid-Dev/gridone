import { FC, ReactNode } from "react";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardTone = "blue" | "green" | "amber" | "violet" | "rose" | "slate";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: StatCardTone;
  trend?: { value: string; direction: "up" | "down" };
  className?: string;
};

const toneClasses: Record<StatCardTone, string> = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  rose: "bg-rose-100 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
};

export const StatCard: FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  tone = "blue",
  trend,
  className,
}) => (
  <Card className={cn("flex items-start gap-4 p-6", className)}>
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
        toneClasses[tone],
      )}
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {trend && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            trend.direction === "up"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700",
          )}
        >
          {trend.direction === "up" ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {trend.value}
        </div>
      )}
    </div>
  </Card>
);

import { Link } from "react-router";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Tone = "default" | "alert";

type StatCardProps = {
  to: string;
  icon: LucideIcon;
  label: string;
  value: number | null;
  loading: boolean;
  tone?: Tone;
};

export function StatCard({
  to,
  icon: Icon,
  label,
  value,
  loading,
  tone = "default",
}: StatCardProps) {
  const isAlert = tone === "alert";

  return (
    <Link to={to} className="group block h-full">
      <Card
        className={cn(
          "card-glow flex h-full flex-col gap-4 p-6 transition-all duration-200 hover:-translate-y-0.5",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            isAlert
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex flex-col gap-1">
          {loading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <span
              className={cn(
                "text-4xl font-semibold tracking-tight tabular-nums",
                isAlert ? "text-destructive" : "text-card-foreground",
              )}
              data-testid="stat-value"
            >
              {value ?? "—"}
            </span>
          )}
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      </Card>
    </Link>
  );
}

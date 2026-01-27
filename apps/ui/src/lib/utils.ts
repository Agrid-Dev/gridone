import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAttributeValue(value: unknown | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return String(value);
}

export function getLastUpdateTime(
  attributes: Record<string, { last_updated?: string | null }>,
): number | null {
  let lastUpdate: number | null = null;

  for (const attribute of Object.values(attributes)) {
    if (attribute.last_updated) {
      const updatedTime = new Date(attribute.last_updated).getTime();
      if (!lastUpdate || updatedTime > lastUpdate) {
        lastUpdate = updatedTime;
      }
    }
  }

  return lastUpdate;
}

export function formatTimeAgo(
  timestamp: number,
  t: (key: string, options?: unknown) => string,
): string {
  const now = Date.now();
  const diffMs = now - timestamp;

  if (diffMs < 0) {
    return t("common.timeAgo.future");
  }

  // Round to minutes
  const minutes = Math.round(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return t("common.timeAgo.days", { count: days });
  }
  if (hours > 0) {
    return t("common.timeAgo.hours", { count: hours });
  }
  if (minutes > 0) {
    return t("common.timeAgo.minutes", { count: minutes });
  }
  return t("common.timeAgo.justNow");
}

export function getUpdateStatusColor(timestamp: number | null): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (!timestamp) {
    return {
      bg: "bg-slate-100",
      text: "text-slate-600",
      border: "border-slate-200",
      dot: "bg-slate-400",
    };
  }

  const now = Date.now();
  const diffMs = now - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);

  // Vert pour les mises à jour récentes (< 5 minutes)
  if (minutes < 5) {
    return {
      bg: "bg-green-100",
      text: "text-green-700",
      border: "border-green-200",
      dot: "bg-green-500",
    };
  }

  // Orange pour les mises à jour moyennes (5 minutes - 1 heure)
  if (hours < 1) {
    return {
      bg: "bg-orange-100",
      text: "text-orange-700",
      border: "border-orange-200",
      dot: "bg-orange-500",
    };
  }

  // Rouge pour les mises à jour anciennes (> 1 heure)
  return {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
  };
}

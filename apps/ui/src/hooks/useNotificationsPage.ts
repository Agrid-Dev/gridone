import { useState } from "react";
import { useSearchParams } from "react-router";
import { toSearchString } from "@/lib/pagination";
import type { Severity } from "@/lib/severity";
import { useNotifications } from "./useNotifications";

type StatusFilter = "all" | "unread" | "dismissed";

function parseStatus(value: string | null): boolean | undefined {
  if (value === "unread") return false;
  if (value === "dismissed") return true;
  return undefined;
}

export function useNotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const severityParam = searchParams.get("severity") as Severity | null;
  const statusParam = searchParams.get("dismissed") as StatusFilter | null;

  const filter = {
    page,
    severity: severityParam ?? undefined,
    dismissed: parseStatus(statusParam),
  };

  const {
    page: data,
    loading,
    error,
    dismiss,
    dismissMany,
  } = useNotifications(filter);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function setSeverity(val: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val === "all") next.delete("severity");
      else next.set("severity", val);
      next.delete("page");
      return next;
    });
    setSelected(new Set());
  }

  function setStatus(val: StatusFilter) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (val === "all") next.delete("dismissed");
      else next.set("dismissed", val);
      next.delete("page");
      return next;
    });
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const undismissed =
      data?.items
        .filter((d) => d.dismissed_at === null)
        .map((d) => d.notification.id) ?? [];
    const allSelected = undismissed.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(undismissed));
  }

  async function handleBulkDismiss() {
    const ids = Array.from(selected);
    await dismissMany(ids);
    setSelected(new Set());
  }

  function handleSingleDismiss(id: string) {
    dismiss(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const undismissedOnPage =
    data?.items
      .filter((d) => d.dismissed_at === null)
      .map((d) => d.notification.id) ?? [];
  const allSelected =
    undismissedOnPage.length > 0 &&
    undismissedOnPage.every((id) => selected.has(id));

  const prevHref = data ? toSearchString(data.links.prev ?? null) : undefined;
  const nextHref = data ? toSearchString(data.links.next ?? null) : undefined;

  return {
    data,
    loading,
    error,
    severityParam,
    statusParam,
    selected,
    allSelected,
    prevHref,
    nextHref,
    setSeverity,
    setStatus,
    toggleSelect,
    toggleSelectAll,
    handleBulkDismiss,
    handleSingleDismiss,
    clearFilters: () => {
      setSearchParams({});
      setSelected(new Set());
    },
  };
}

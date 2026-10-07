import { useState } from "react";
import { Link, NavLink, useMatch } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type {
  DashboardSummary,
  StructureGroup,
  StructureSection,
} from "@gridone/sdk";
import { DashboardIconGlyph } from "@/lib/dashboardIcons";
import { cn } from "@/lib/utils";
import { useDashboardStructureEntries } from "@/pages/dashboards/useDashboards";

const COLLAPSED_KEY = "gridone.sidebar.collapsedSections";

function readCollapsed(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(COLLAPSED_KEY) ?? "[]",
    );
    return new Set(Array.isArray(parsed) ? parsed.filter(isString) : []);
  } catch {
    return new Set();
  }
}

const isString = (value: unknown): value is string => typeof value === "string";

const entryClass = (active: boolean, depth = 0) =>
  cn(
    "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    depth > 0 && "pl-6",
    active
      ? "bg-accent text-accent-foreground"
      : "text-sidebar-foreground hover:bg-accent/60 hover:text-foreground",
  );

const dashboardPath = (id: string) => `/dashboards/${encodeURIComponent(id)}`;

/** The Supervision entries: each dashboard is a view of the building, listed
 *  the way a BMS lists its views — as the structure arranges them. A group is
 *  one entry opening its first tab, a section a collapsible heading. Active
 *  on its own route only, not while authoring a widget. */
export function SidebarDashboards() {
  const { structure } = useDashboardStructureEntries();
  const match = useMatch("/dashboards/:dashboardId/*");
  const activeId = match?.params.dashboardId ?? null;
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = (sectionId: string) => {
    const next = new Set(collapsed);
    if (next.has(sectionId)) next.delete(sectionId);
    else next.add(sectionId);
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // Remembering is a convenience; the toggle still works for the visit.
    }
  };

  return (
    <>
      {structure.items.map((item) => {
        if (item.kind === "dashboard")
          return <DashboardEntry key={item.id} dashboard={item} />;
        if (item.kind === "group")
          return <GroupEntry key={item.id} group={item} activeId={activeId} />;
        return (
          <SectionEntry
            key={item.id}
            section={item}
            activeId={activeId}
            collapsed={collapsed.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        );
      })}
    </>
  );
}

function DashboardEntry({
  dashboard,
  depth = 0,
}: {
  dashboard: DashboardSummary;
  depth?: number;
}) {
  return (
    <NavLink
      to={dashboardPath(dashboard.id)}
      end
      className={({ isActive }) => entryClass(isActive, depth)}
    >
      <DashboardIconGlyph icon={dashboard.icon} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{dashboard.name}</span>
    </NavLink>
  );
}

/** A group opens its first dashboard and stays lit on any of its tabs. A
 *  group with nothing in it has nowhere to go, so it is not listed. */
function GroupEntry({
  group,
  activeId,
  depth = 0,
}: {
  group: StructureGroup;
  activeId: string | null;
  depth?: number;
}) {
  const first = group.dashboards[0];
  if (!first) return null;
  const active = group.dashboards.some((d) => d.id === activeId);
  // A plain Link: NavLink would light it on its first tab's route only.
  return (
    <Link
      to={dashboardPath(first.id)}
      className={entryClass(active, depth)}
      aria-current={active ? "page" : undefined}
    >
      <DashboardIconGlyph icon={group.icon} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{group.label}</span>
    </Link>
  );
}

/** A section folds its entries under a heading with a chevron. It stays
 *  open while it holds the dashboard being viewed, and an empty one is not
 *  listed. */
function SectionEntry({
  section,
  activeId,
  collapsed,
  onToggle,
}: {
  section: StructureSection;
  activeId: string | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("common");
  const entries = section.items.filter(
    (item) => item.kind === "dashboard" || item.dashboards.length > 0,
  );
  if (entries.length === 0) return null;
  const holdsActive = entries.some((item) =>
    item.kind === "dashboard"
      ? item.id === activeId
      : item.dashboards.some((d) => d.id === activeId),
  );
  const open = !collapsed || holdsActive;
  const panelId = `sidebar-section-${section.id}`;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70 hover:text-foreground"
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {section.label}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="sr-only">
          {t(open ? "sidebar.section.collapse" : "sidebar.section.expand")}
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-0.5">
          {entries.map((item) =>
            item.kind === "dashboard" ? (
              <DashboardEntry key={item.id} dashboard={item} depth={1} />
            ) : (
              <GroupEntry
                key={item.id}
                group={item}
                activeId={activeId}
                depth={1}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

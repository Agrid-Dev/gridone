import { useState } from "react";
import { Link, NavLink, useMatch } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type {
  DashboardIcon,
  DashboardSummary,
  StructureGroup,
  StructureSection,
} from "@gridone/sdk";
import { DashboardIconGlyph } from "@/lib/dashboardIcons";
import { cn } from "@/lib/utils";
import { useDashboardStructureEntries } from "@/pages/dashboards/useDashboards";
import { SectionLabel, navLinkClass } from "./SidebarParts";

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

/** A section's entries sit a step down: smaller, lighter type under the
 *  section's guide line. 34 px on the desktop rail, 44 px in the drawer. */
const nestedClass = (active: boolean) =>
  cn(
    "flex min-h-11 items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition-colors lg:min-h-[34px] [&>svg]:shrink-0",
    active
      ? "bg-accent font-medium text-accent-foreground [&>svg]:text-primary"
      : "text-sidebar-foreground hover:bg-accent/60 hover:text-foreground [&>svg]:text-muted-foreground",
  );

const entryClass = (active: boolean, depth = 0) =>
  depth > 0 ? nestedClass(active) : navLinkClass({ isActive: active });

const hasDashboards = (item: StructureSection["items"][number]) =>
  item.kind === "dashboard" || item.dashboards.length > 0;

const dashboardPath = (id: string) => `/dashboards/${encodeURIComponent(id)}`;

/** The Supervision entries: each dashboard is a view of the building, listed
 *  the way a BMS lists its views — as the structure arranges them. A group is
 *  one entry opening its first tab, a section a collapsible heading. Active
 *  on its own route only, not while authoring a widget. The block comes with
 *  its heading and a rule closing it, and is left out when nothing in the
 *  structure has a dashboard to open. */
export function SidebarDashboards() {
  const { t } = useTranslation("common");
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

  const listed = structure.items.some((item) =>
    item.kind === "section"
      ? item.items.some(hasDashboards)
      : hasDashboards(item),
  );
  if (!listed) return null;

  return (
    <>
      <SectionLabel>{t("app.dashboards")}</SectionLabel>
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
      <div aria-hidden className="py-2">
        <div className="mx-3 h-px bg-border" />
      </div>
    </>
  );
}

/** A top-level entry without an icon keeps the icon's slot, so its label
 *  lines up with the sections' labels. */
function EntryIcon({
  icon,
  depth,
}: {
  icon: DashboardIcon | null | undefined;
  depth: number;
}) {
  if (icon) return <DashboardIconGlyph icon={icon} className="h-4 w-4" />;
  return depth === 0 ? <span aria-hidden className="h-4 w-4 shrink-0" /> : null;
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
      <EntryIcon icon={dashboard.icon} depth={depth} />
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
      <EntryIcon icon={group.icon} depth={depth} />
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
  const entries = section.items.filter(hasDashboards);
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
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent/60 lg:min-h-9"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {section.label}
        </span>
        <span className="sr-only">
          {t(open ? "sidebar.section.collapse" : "sidebar.section.expand")}
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          className="ml-[19px] space-y-0.5 border-l border-border pl-2"
        >
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

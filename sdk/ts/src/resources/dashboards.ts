import type { RequestFn } from "../http/httpClient";
import type {
  Dashboard,
  DashboardCreate,
  DashboardPatch,
  DashboardSummary,
  LayoutItem,
  Widget,
  WidgetCreateBody,
  WidgetUpdateBody,
} from "../types";

/** JSON Schemas of the registered widget types, keyed by widget type. */
export type WidgetSchemas = Record<string, Record<string, unknown>>;

/** `client.dashboards` — dashboards, their widgets, and grid layout. */
export class DashboardsResource {
  constructor(private readonly request: RequestFn) {}

  /** Summaries only (no widgets or layout). */
  list(): Promise<DashboardSummary[]> {
    return this.request("GET", "/dashboards/");
  }

  /** The full dashboard document, including widgets and the derived layout. */
  get(dashboardId: string): Promise<Dashboard> {
    return this.request(
      "GET",
      `/dashboards/${encodeURIComponent(dashboardId)}`,
    );
  }

  create(params: DashboardCreate): Promise<Dashboard> {
    return this.request("POST", "/dashboards/", { body: params });
  }

  update(dashboardId: string, params: DashboardPatch): Promise<Dashboard> {
    return this.request(
      "PUT",
      `/dashboards/${encodeURIComponent(dashboardId)}`,
      { body: params },
    );
  }

  delete(dashboardId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/dashboards/${encodeURIComponent(dashboardId)}`,
    );
  }

  addWidget(dashboardId: string, params: WidgetCreateBody): Promise<Widget> {
    return this.request(
      "POST",
      `/dashboards/${encodeURIComponent(dashboardId)}/widgets`,
      { body: params },
    );
  }

  updateWidget(
    dashboardId: string,
    widgetId: string,
    params: WidgetUpdateBody,
  ): Promise<Widget> {
    return this.request(
      "PUT",
      `/dashboards/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}`,
      { body: params },
    );
  }

  removeWidget(dashboardId: string, widgetId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/dashboards/${encodeURIComponent(dashboardId)}/widgets/${encodeURIComponent(widgetId)}`,
    );
  }

  /** Full-replacement of the grid layout (react-grid-layout `[{i,x,y,w,h}]`). */
  updateLayout(dashboardId: string, items: LayoutItem[]): Promise<Dashboard> {
    return this.request(
      "PUT",
      `/dashboards/${encodeURIComponent(dashboardId)}/layout`,
      { body: items },
    );
  }

  /** JSON Schema per registered widget type (consumable by `z.fromJSONSchema`). */
  getWidgetSchemas(): Promise<WidgetSchemas> {
    return this.request("GET", "/dashboards/widget-schemas");
  }
}

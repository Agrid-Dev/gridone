import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  DispatchNotificationRequest,
  NotificationDispatch,
  Page,
} from "../types";

export type NotificationListParams = NonNullable<
  operations["list_notifications_notifications__get"]["parameters"]["query"]
>;

/** `client.notifications` — per-user notification dispatches. */
export class NotificationsResource {
  constructor(private readonly request: RequestFn) {}

  list(params?: NotificationListParams): Promise<Page<NotificationDispatch>> {
    return this.request("GET", "/notifications/", { searchParams: params });
  }

  /** Dispatches a notification; returns one dispatch per targeted user. */
  dispatch(
    params: DispatchNotificationRequest,
  ): Promise<NotificationDispatch[]> {
    return this.request("POST", "/notifications/", { body: params });
  }

  dismiss(notificationId: string): Promise<NotificationDispatch> {
    return this.request(
      "POST",
      `/notifications/${encodeURIComponent(notificationId)}/dismiss`,
    );
  }
}

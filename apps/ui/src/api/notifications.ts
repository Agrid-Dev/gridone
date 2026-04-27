import { type Severity } from "./devices";
import { request } from "./request";
import type { Page } from "./pagination";

export type { Severity };

export type Notification = {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  correlationId: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type NotificationDispatch = {
  notification: Notification;
  userId: string;
  dispatchedAt: string;
  dismissedAt: string | null;
};

export type NotificationsFilter = {
  severity?: Severity;
  dismissed?: boolean;
  page?: number;
  size?: number;
};

export function listNotifications(
  filter?: NotificationsFilter,
): Promise<Page<NotificationDispatch>> {
  const params = new URLSearchParams();
  if (filter?.severity !== undefined) params.set("severity", filter.severity);
  if (filter?.dismissed !== undefined)
    params.set("dismissed", String(filter.dismissed));
  if (filter?.page !== undefined) params.set("page", String(filter.page));
  if (filter?.size !== undefined) params.set("size", String(filter.size));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<Page<NotificationDispatch>>(
    `/notifications/${query}`,
    undefined,
    {
      camelCase: true,
    },
  );
}

export function dismissNotification(
  notificationId: string,
): Promise<NotificationDispatch> {
  return request<NotificationDispatch>(
    `/notifications/${encodeURIComponent(notificationId)}/dismiss`,
    { method: "POST" },
    { camelCase: true },
  );
}

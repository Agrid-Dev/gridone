# gridone-notifications

Handles notification dispatch and per-user delivery tracking for the Gridone platform.

A `Notification` represents a unique event (title, body, severity). Passing a `correlation_id` deduplicates across calls — a second dispatch with the same `correlation_id` reuses the existing notification rather than creating a duplicate; if the content differs, an `InvalidError` is raised. 
A `NotificationDispatch` records that a specific notification was delivered to a specific user, and tracks whether the user has dismissed it.

## Storage

Pass a storage URL to `NotificationsService`:

| Scheme | Backend |
|--------|---------|
| `postgresql://` | PostgreSQL (asyncpg + yoyo migrations) |

Migrations run automatically on startup. The service creates two tables: `notifications` (deduped by `correlation_id`) and `notification_dispatches` (one active row per user per notification, with dismissal timestamp).

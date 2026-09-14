# Device views

`DeviceViewsService(storage_url)` owns shared display configurations: name,
description, a `DevicesFilter`, ordered `group_by` tag keys and audit timestamps.
It stores no device IDs and has no dependency on devices-manager. Empty views
remain valid; deleting a view never changes device tags or command templates.

Call `start()` before CRUD and `stop()` during shutdown. `None` uses memory;
`postgresql://` and `postgresql+asyncpg://` use the package-owned `device_views`
table, with migrations and connection lifecycle managed inside storage.

The API wires the service at `/device-views` using the existing device permissions.

## UI groups

The primary UI flow asks for a name and selected devices. It adds a stable value
under the ordinary multi-valued `group` tag and saves a view with that filter and
`group_by: []`. Membership stays on devices; the view stores no device IDs.
The UI can edit membership or remove the group's tag before deleting the view.
The generic view API remains display-only. Advanced views can group by ordered
tag keys, or leave `group_by` empty to display the matching devices together.

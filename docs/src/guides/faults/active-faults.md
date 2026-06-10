# Active Faults

## Background

A [fault](../../reference/glossary.md#fault) is a detected anomaly on a [device](../../reference/glossary.md#device) [attribute](../../reference/glossary.md#attribute) — for example, a value outside an expected range. 

When a device turns faulty, a [notification](../../reference/glossary.md#notification) is immediately dispatched to the user. See [Notifications](../notifications/notifications.md).

---

## Faults page

Click **Faults** in the sidebar to see all active faults across your fleet.

Each row shows:

- **Device** — the device reporting the fault. Click the name to open its detail page.
- **Fault** — a description of the anomaly.
- **Severity** — the fault's [severity](../../reference/glossary.md#severity) level.
- **Active since** — how long the fault has been active.

Use the search field to filter by device name or attribute name.

---

## Filter devices by health

On the **Devices** page, use the **All / Healthy / Faulty** toggle to show only devices that currently have active faults (**Faulty**) or only devices with no active faults (**Healthy**).

---

## Faults on the device page

Faults are also visible on each device's detail page. Open a device and expand the **Faults** section to see a list of all fault attributes currently active on that device.

> When a device returns to it's healthy state, the faults disappears from both faults page and device page.

# Send a Command

## Background

A [command](../../reference/glossary.md#command) writes a new value to an [attribute](../../reference/glossary.md#attribute) on one or more [devices](../../reference/glossary.md#device).

- A **[unit command](../../reference/glossary.md#unit-command)** targets a single attribute on a single device.
- A **[batch command](../../reference/glossary.md#batch-command)** targets a single attribute across multiple devices in one dispatch.

There are three ways to send a command in Gridone:

| Path | Best for |
|------|---------|
| [Standard device control](#1-standard-device-control) | Quick adjustments on known standard device types |
| [Unit command wizard](#2-unit-command-wizard) | Any single-device write, or when saving as a template |
| [Batch command wizard](#3-batch-command-wizard) | The same attribute write across multiple devices at once |

---

## 1. Standard device control

Available only for [standard devices](../../reference/glossary.md#standard-device) (thermostats, AWHPs, weather sensors, electricity meters).

1. Click **Devices** in the sidebar and open a device.
2. The **Live Control** tab opens by default. For standard devices, a dedicated control widget mimicking the physical device appears on the page with labelled controls for the device's key attributes.
3. Click a control in the widget — the command fires immediately and the widget updates to reflect the new value.

Verify under **History > Commands** on the device page.

---

## 2. Unit command wizard

Send a command to a single [attribute](../../reference/glossary.md#attribute) on a single device.

1. Click **Devices** in the sidebar.
2. Open the wizard:
    - Open the device, then click **New command** in the header. The target is pre-filled to that device; skip to step 4.
    - Click **New command** from the device list page or from the **Commands** in the sub-navigation.
3. **Target step** — select a single device. Use the search box or the type and zone filters to narrow the list. Click **Next**.
4. **Command step** — select a writable attribute from the dropdown, then set the new value. The current value is pre-filled for reference. The input adapts to the attribute's data type:
    - **ON / OFF toggle** — for boolean attributes.
    - **Number input** — for integer or float attributes.
    - **Text input** — for string attributes.
    - **Dropdown** — for attributes with predefined values (standard device types).
5. Click **Next**.
6. **Review step** — the table shows the current → new value for the target device. Click **Dispatch**.

A toast confirms the command was dispatched. You are taken to the device's command history.

---

## 3. Batch command wizard

Send the same value to an [attribute](../../reference/glossary.md#attribute) across multiple devices in a single dispatch.

1. Click **Devices** in the sidebar.
2. Click **New command** from the device list page or from the **Commands** in the sub-navigation.
3. **Target step** — choose how to select the target devices:

    === "Specific devices"
        Check the devices you want to include. Use the search box or the type and zone filters to narrow the list. Click **Next**.

    === "By filter"
        Select a [zone](../../reference/glossary.md#zone) and optionally one or more device types. Gridone shows a list of the devices that currently match. 
        The filter is re-evaluated at dispatch time, so the actual set of devices may differ if zone membership changes. 
        Click **Next**.

4. **Command step** — only attributes shared across all selected devices (same name and data type) are shown. Select an attribute and enter the value to write. 
    If no compatible attribute appears, the selected devices do not share a writable attribute — narrow your selection. Click **Next**.
5. **Review step** — the table lists every target device with its current → new value. Click **Dispatch**.

A toast confirms the commands were dispatched. You are taken to the Commands list, filtered to this batch.

---

> **Save as a template:** In the Review step of either wizard, enter a name and click **Save as template** to store this command configuration for later reuse. See [Command templates](templates.md).

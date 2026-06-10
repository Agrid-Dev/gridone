# Getting Started — Operators

This guide walks you through the Gridone app interface, explaining the reading of 
a live data from a [device](../reference/glossary.md#device) and writing a value to one of its
[attributes](../reference/glossary.md#attribute).

## Before you begin

You'll need credentials (username and password) provided by your administrator, or integrator, and the
URL of your Gridone instance.

---

## 1. Log in

Open the Gridone URL in your browser. You will see a login card with a **Username** and
**Password** field. Enter your credentials and click **Sign in**.

After signing in you land on the home page.

---

## 2. Navigate the UI

The interface has two fixed elements:

**Left sidebar** — the main navigation. Allows you to access your resources.
From top to bottom: Zones, Devices, Drivers, Apps, Automations, Faults, and Settings. 
The Gridone version number appears at the bottom.

**Top bar** — runs across the top of every page. Your initials on the right open your
profile, where you can update account settings. The bell icon opens Notifications; a
red dot means you have unread messages.

---

## 3. Monitoring a device

1. Click **Devices** in the sidebar. Your devices appear in an alphabetically sorted grid of
   cards. Each card shows the device name and type. For [standard devices](../reference/glossary.md#standard-device)
   — thermostats, heat pumps, weather sensors, and electricity meters — the card also displays a
   live preview of key metrics. You can search for a device by using filters like the device type or health status, 
   or search using keyword.

2. Click a device card to open its detail page. The **Live Control** view shows the current value
   of every [attribute](../reference/glossary.md#attribute). For [standard devices](../reference/glossary.md#standard-device), 
   a dedicated control widget, similar to your physical device, gives you an at-a-glance overview of live
   value of the device's key attributes. 

3. The connection status badge next to the device name in the header — **Connected**,
   **Degraded**, **Disconnected**, or **Idle** — shows whether Gridone is successfully
   communicating with the device. If the status is anything other than **Connected**, there is a
   connection or driver issue; contact your integrator.

4. Click **History** in the device header to explore the device's recorded data. Switch between
   the **Table** and **Chart** views, adjust the time range, and select which attributes to
   display. You can download the data as a CSV (table view) or a PNG (chart view).

---

## 4. Send a command

A [command](../reference/glossary.md#command) writes a new value to a writable
[attribute](../reference/glossary.md#attribute) on one or more devices. There are two ways to do this:

### From the Live Control page

For [standard devices](../reference/glossary.md#standard-device), the **Live Control** page shows a dedicated control widget 
that lets you send commands directly by adjusting settings on certain attributes.
>Note: Currently, the live device control does not allow to adjust settings and send commands for all attributes.

### From the command wizard

The command wizard lets you send a command in a guided flow.

- **For a single device**: open the device's detail page and click **New command** in the
  header — the device is pre-selected as the target.
- **For multiple devices**: go to the **Devices** list and click **New command** in the page
  header — you select the target devices in the first step of the wizard.

The wizard walks you through three steps:

1. **Target** — select the devices to send the command to.
2. **Command** — pick a writable attribute and set the new value. The current value is
   pre-filled for reference. The input adapts to the attribute's data type:
    - **ON / OFF toggle** — for on/off attributes.
    - **Number input** — for numeric attributes.
    - **Text input** — for text attributes.
    - **Dropdown** — for attributes with predefined standard values for standard device types.
3. **Review** — confirm the current → new value for each target device, then click **Dispatch**.

A toast confirms the command was dispatched. You can track the result under **History > Commands** 
on the device page, or save it as a reusable template from the Review step.

---

> Congratulations, you just sent your first device command! You can now monitor and control
> all the devices in your building from a single application. To go further, discover how to
> [send grouped commands](../guides/commands/send-command.md) or [create automations](../guides/automations/create.md).

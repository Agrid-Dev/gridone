# Getting Started — Operators

This guide walks you through the Gridone app interface, explaining the reading of 
a live data from a [device](../reference/glossary.md) and writing a value to one of its
[attributes](../reference/glossary.md).

## Before you begin

You'll need credentials (username and password) provided by your administrator, and the
URL of your Gridone instance.

---

## 1. Log in

Open the Gridone URL in your browser. You will see a login card with a **Username** and
**Password** field. Enter your credentials and click **Sign in**.

After signing in you land on the home page.

---

## 2. Navigate the UI

The interface has two fixed elements:

**Left sidebar** — the main navigation. From top to bottom: Zones, Devices, Drivers,
Apps, Automations, Faults, and Settings. The Gridone version number appears at the
bottom.

**Top bar** — runs across the top of every page. Your initials on the right open your
profile, where you can update account settings. The bell icon opens Notifications; a
red dot means you have unread messages.

---

## 3. Read a live device attribute

1. Click **Devices** in the sidebar. You will see a grid of [device](../reference/glossary.md)
   cards sorted alphabetically. Each card shows:
    - The device name and a type chip.
    - For [standard devices](../reference/standard-devices.md) (thermostat, AWHP,
      weather sensor, electricity meter), the card shows a live preview of key attribute
      values. Other devices show an attribute count instead.
    - A yellow or red icon in the top-left corner indicates if the device is degraded or
      disconnected — no icon means the device is healthy.

2. Click a device card to open its detail page. The header shows:
    - The device name, type, and a connection status badge — **Connected**,
      **Degraded**, **Disconnected**, or **Idle**.
    - For physical devices: the driver and transport (network) the device is connected
      through, plus any device-specific config values (e.g. unit ID or IP address).

3. Below the header is the **Live Control** view. For [standard devices](../reference/standard-devices.md)
   this shows a purpose-built control panel with live metrics and controls.

---

## 4. Send a command

A [command](../reference/glossary.md) writes a new value to a writable
[attribute](../reference/glossary.md) on a device.

1. Click **New command** from the device detail header or from the **Devices** list.
   Select one or more target devices to send the command to. For the full multi-device
   flow, see the [Send a command](../guides/commands/send-command.md) guide.

2. In the **Command** step, select a writable attribute from the **Attribute**
   dropdown. The current value is pre-filled.

3. Set the new value using the input provided:
    - **ON / OFF toggle** — for on/off attributes.
    - **Number input** — for numeric attributes.
    - **Text input** — for text attributes.
    - **Dropdown** — for attributes with predefined standard values for standard device types.

4. Click **Next** to proceed to the **Review** step. Confirm the attribute and value,
   then click **Dispatch**. You can also save the command template for future use.

5. A toast notification confirms the command was dispatched. You can view the
   device's command history to verify the execution result.

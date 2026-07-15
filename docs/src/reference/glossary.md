# Glossary

## Action

The step Gridone performs when an [automation's](#automation) [trigger](#trigger) fires. Available action types: **Run a command** (dispatches a [command template](#template) to its target devices) and **Send a notification** (delivers an in-app message to selected users).

---

## Automation

A rule that pairs a [trigger](#trigger) with an [action](#action). When the trigger condition is met, Gridone fires the action automatically. Each run is recorded as an [execution](#execution). See [Create an automation](../guides/automations/create.md).

---

## Attribute

A data point on a device — a single value that Gridone can read, write, or both. Each attribute has a name, a data type (`bool`, `int`, `float`, or `str`), and a current live value.

Typical examples:

- `temperature` (`float`)
- `temperature_setpoint` (`float`)
- `onoff_state` (`bool`)
- `fault_code` (`int` / `str`)

---

## Codec

A reversible transformation applied to an [attribute](#attribute) value converting between the device's raw wire format and Gridone's internal typed value on read, and back on write. Codecs are declared as an ordered list on an attribute and applied in sequence.

---

## Command

An instruction that writes a new value to an [attribute](#attribute) on one or more [devices](#device).

### Unit command

A [command](#command) that targets a single [attribute](#attribute) on a single [device](#device).

### Batch command

A [command](#command) that writes the same value to an [attribute](#attribute) across multiple [devices](#device) in a single dispatch. A batch command is a set of unit commands.

---

## Device

A physical unit connected to Gridone. Each device is linked to a [driver](#driver) (which describes its attributes and protocol) and a [network](#network) (which carries the connection). Gridone syncs devices continuously and records their attribute values.

---

## Device config

The set of per-device parameters that identify a specific unit on its [network](#network) — for example, an IP address or device ID. The required fields are declared by the [driver](#driver) and filled in when adding a device.

---

## Discovery

A mechanism that automatically registers [devices](#device) on an MQTT [network](#network) by listening for announcements matching a specific [driver](#driver). Any announcing device is imported without manual config entry per device.

---

## Execution

A record of a single run of an [automation](#automation). Each execution captures the timestamp, the outcome (success or failure), any error details, and when the [action](#action) dispatched a batch command — a link to that batch. See [Execution history](../guides/automations/executions.md).

---

## Fault

A special type of [attribute](#attribute) that some [devices](#device) expose to report their internal health state. A fault attribute has a [severity](#severity) and can take different values — some indicating the device is healthy, others signalling an anomaly. Faults clear automatically when the device returns to a healthy state. See [Active faults](../guides/faults/active-faults.md).

---

## Health check

Configuration in a [driver](#driver) that declares how Gridone should assess whether a [device](#device) is still alive, independent of how its data is fetched. Currently covers the expected interval between emissions for push-based devices, used to drive silence detection.

---

## Driver

A driver is the declaration of _how_ Gridone should communicate with a specific device: its attributes, how to read and write them, and which protocol it uses. One driver covers all physical units of the same vendor and model — write it once and reuse it across many devices. Drivers are packaged as YAML files, a format that ensures both readability and portability. See [Write a driver](../guides/drivers/write-driver.md).

---

## Network

A configured connection channel through which Gridone communicates with [devices](#device). Each network has a name and a protocol — MQTT, HTTP, Modbus TCP, BACnet, etc. Multiple devices can share the same network. A device can only be assigned to a network whose protocol matches its [driver](#driver). See [Add a device](../guides/devices/add-device.md).

---

## Notification

A message dispatched to one or more users about an event (e.g. when an [automation](#automation) fires). Notifications have a [severity](#severity), a title, and an optional message body. They can be dismissed individually or in bulk. See [Notifications](../guides/notifications/notifications.md).

---

## Severity

A label that classifies the importance of a [fault](#fault) or [notification](#notification). Three levels are available, in increasing order of urgency: **Info**, **Warning**, and **Alert**. Used to filter both the Faults page and the Notifications page.

---

## Standard device

A [device](#device) whose driver declares a `type` matching one of Gridone's built-in schemas (e.g. `thermostat`, `awhp`, `weather_sensor`, `electricity_meter`). Standard devices get a purpose-built control widget in the UI and a consistent, validated data model. See [Standard devices](standard-devices.md).

---

## Transport address

The protocol-specific instruction in a [driver](#driver) that declares how to read or write a specific [attribute](#attribute) on a device. Each attribute declares a `read`, `write`, or `read_write` address in the syntax of its transport protocol.

---

## Trigger

The condition that causes an [automation](#automation) to fire. Available trigger types: **Schedule** (a cron expression) and **Attribute change** (a device attribute value change, with an optional comparison condition).

---

## Template

A saved command configuration — target, attribute, and value — that can be dispatched multiple times without re-entering the details each time. See [Command templates](../guides/commands/templates.md).

---

## Update strategy

Configuration in a [driver](#driver) that controls how often Gridone polls a device for [attribute](#attribute) values and how long to wait for a response. Polling can be disabled for push-based protocols where the device publishes updates spontaneously.

---

## Zone

A logical grouping of [devices](#device) — for example a room, floor, or building. Zones are hierarchical: a zone can contain child zones. In the command wizard, you can use a zone as the target of a [batch command](#batch-command), so the command is sent to every device in that zone.

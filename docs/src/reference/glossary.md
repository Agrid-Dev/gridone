# Glossary

## Attribute

A data point on a device — a single value that Gridone can read, write, or both. Each attribute has a name, a data type (`bool`, `int`, `float`, or `str`), and a current live value. Examples: `temperature`, `setpoint`, `on_off`.

---

## Batch command

A [command](#command) that writes the same value to an [attribute](#attribute) across multiple [devices](#device) in a single dispatch. Sent via the [command wizard](../guides/commands/send-command.md#3-batch-command-wizard).

---

## Command

An instruction that writes a new value to an [attribute](#attribute) on one or more [devices](#device). See also: [unit command](#unit-command), [batch command](#batch-command).

---

## Device

A physical unit connected to Gridone. Each device is linked to a [driver](#driver) (which describes its attributes and protocol) and a transport (which carries the network connection). Gridone polls devices continuously and records their attribute values.

---

## Driver

A YAML file that describes a device model: its attributes, how to read and write them, and which protocol it uses. One driver covers all physical units of the same vendor and model — write it once and reuse it across many devices. See [Write a driver](../guides/drivers/write-driver.md).

---

## Standard device

A [device](#device) whose driver declares a `type` matching one of Gridone's built-in schemas (e.g. `thermostat`, `awhp`, `weather_sensor`, `electricity_meter`). Standard devices get a purpose-built control widget in the UI and a consistent, validated data model. See [Standard devices](standard-devices.md).

---

## Template

A saved command configuration — target, attribute, and value — that can be dispatched multiple times without re-entering the details each time. Templates are created from the wizard's Review step and managed under **Devices > Commands > Templates**. See [Command templates](../guides/commands/templates.md).

---

## Unit command

A [command](#command) that targets a single [attribute](#attribute) on a single [device](#device). Sent via the [command wizard](../guides/commands/send-command.md#2-unit-command-wizard).

---

## Zone

A logical grouping of [devices](#device) — for example a room, floor, or building. Zones are hierarchical: a zone can contain child zones. In the command wizard, you can use a zone as the target of a [batch command](#batch-command), so the command is sent to every device in that zone.

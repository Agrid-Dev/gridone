# Getting Started — Integrators

This guide walks you through connecting a device to Gridone: registering a driver,
adding a device with its network connection, and verifying live data.

## Before you begin

You'll need Gridone up and running before following this guide. If you haven't
set that up yet, refer to the [Developer track](developers.md) for setup.

---

## 1. Register a driver

A [**driver**](../reference/glossary.md) is a YAML file that describes a device
model: its attributes, how to read and write them, and which protocol it uses. One
driver covers all physical units of the same vendor/model — you write it once and
reuse it across many devices.

!!! info "Driver library coming soon"
    An online library of ready-made drivers will be available shortly. In the meantime,
    manually write a driver from the device data sheet.

**To register a driver:**

1. Click **Drivers** in the sidebar.
2. Click **Create**.
3. Paste your driver YAML into the editor. Key fields to fill in from the data sheet:
    - `transport` — the protocol the device speaks
    - `device_config` — per-instance parameters (e.g. `ip`, `device_id`) needed to
      address a specific unit on the network
    - `attributes` — one entry per readable or writable value, with its name,
      data type, and read/write address
4. Click **Submit**.

For the full driver YAML schema — all fields, address formats, and codec options —
see [Reference > Driver Schema](../reference/driver-schema/general-layout.md).

---

## 2. Add a device

A [**device**](../reference/glossary.md) maps one physical unit to its driver and
network connection.

1. Click **Devices** in the sidebar.
2. Click **Add** to create a new device.
3. Enter a **device name**.
4. Select the **driver** you registered in [Step 1](#1-register-a-driver). The
   dropdown shows the driver's ID as set in the YAML, plus vendor, model, version,
   and protocol if declared.
5. Select or create a **network** (the transport connecting to your device network).
   The dropdown only shows networks that match the driver's protocol.
    - If a suitable network already exists, select it.
    - Otherwise, click **+ Create new network**. A modal opens with the protocol
      pre-set. Fill in the connection details (host, port, and any other
      protocol-specific fields — values come from your network infrastructure documentation).
      Click **Submit**; the new network is automatically selected.
6. Fill in the **device config fields** declared by the driver — these identify this
   specific unit on the network (e.g. IP address, device ID). Values come from the
   device data sheet.
7. Click **Create device**. Gridone will start polling the device immediately.

---

## 3. Verify

Open the device detail page by clicking the device in the list.

The **connection status badge** on the device confirms the underlying network
connection is active.

Attribute cards — one per attribute declared in the driver, show the current live
value. Updating values confirm the device is connected and polling correctly.

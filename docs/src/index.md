# Gridone: The Backbone of Scalable Building Automation

Buildings are full of untapped automation potential. **Gridone** is the open platform that connects your software to any building equipment — regardless of protocol, vendor, or model.

---

## Why Gridone?

Every building is different. Every equipment in it comes with its own protocol, its own SDK, its own quirks. Teams end up writing the same integration glue over and over, project after project.

**The three problems Gridone solves:**

**Proprietary everything** — every vendor ships a different SDK, API, or communication style. You spend more time reading datasheets than building applications.

**Protocol fragmentation** — BACnet, Modbus, MQTT, HTTP... each requires a completely different integration stack.

**No common data model** — raw device values have no standard shape, making it impossible to build applications that work across devices.

Gridone is a platform layer. 
It abstracts devices behind a unified API using YAML-based drivers — you describe the device once, and Gridone handles communication. Build your building application on top, not around vendor lock-in.

---

## Introducing: Devices drivers

> **YAML-based, reusable device drivers.**


Let's solve the integration problem with building hardware all at once.

A Gridone driver is a YAML file that declares a device's attributes and how to read or write them — in its native protocol. That's where proprietary specifics live, and nowhere else. Declare once, reuse across buildings, share with the community.

=== "HTTP"

    ```yaml
    id: agrid_thermostat
    transport: http

    device_config:
      - name: ip

    attributes:
      - name: temperature
        data_type: float
        read: "GET ${ip}/api/v1/status"
        json_pointer: /temperature

      - name: setpoint
        data_type: float
        read: "GET ${ip}/api/v1/status"
        json_pointer: /setpoint
        write:
          method: POST
          path: "${ip}/api/v1/setpoint"
          body:
            value: ${value}

      - name: enabled
        data_type: bool
        read: "GET ${ip}/api/v1/status"
        json_pointer: /enabled
        write:
          method: POST
          path: "${ip}/api/v1/enabled"
          body:
            value: ${value}
    ```

=== "MQTT"

    ```yaml
    id: agrid_thermostat
    transport: mqtt

    device_config:
      - name: device_id

    attributes:
      - name: temperature
        data_type: float
        read:
          topic: agrid/${device_id}/snapshot
          request:
            topic: agrid/${device_id}/get/snapshot
            message:
              input: request
        json_pointer: /temperature

      - name: setpoint
        data_type: float
        read:
          topic: agrid/${device_id}/snapshot
          request:
            topic: agrid/${device_id}/get/snapshot
            message:
              input: request
        write:
          topic: agrid/${device_id}/set/setpoint
          request:
            topic: agrid/${device_id}/set/setpoint
            message:
              value: ${value}
        json_pointer: /setpoint

      - name: enabled
        data_type: bool
        read:
          topic: agrid/${device_id}/snapshot
          request:
            topic: agrid/${device_id}/get/snapshot
            message:
              input: request
        write:
          topic: agrid/${device_id}/set/enabled
          request:
            topic: agrid/${device_id}/set/enabled
            message:
              value: ${value}
        json_pointer: /enabled
    ```

=== "Modbus"

    ```yaml
    id: agrid_thermostat
    transport: modbus-tcp

    device_config:
      - name: device_id

    attributes:
      - name: temperature
        data_type: float
        read: IR0:2
        byte_convert: "float32 big_endian"

      - name: setpoint
        data_type: float
        read_write: HR0:2
        byte_convert: "float32 big_endian"

      - name: enabled
        data_type: bool
        read_write: C0
    ```

=== "BACnet"

    ```yaml
    id: agrid_thermostat
    transport: bacnet

    device_config:
      - name: device_instance

    attributes:
      - name: temperature
        data_type: float
        read: "AI 0"

      - name: setpoint
        data_type: float
        read_write: "AV 1"

      - name: enabled
        data_type: bool
        read_write: "BV 0 P8"
    ```

---

## What you get

**YAML-based, reusable device drivers** — one file per device model, shared across buildings and protocols.

**Automatic time-series recording** — every reading stored automatically. Query, aggregate, and export historical data with no extra setup.

**REST API for every capability** — control devices, query data, manage configuration. All over a documented HTTP API.

**Self-hosted and Open source** — deploy anywhere. No vendor lock-in, full control over your infrastructure and data.

---

## Get started

```sh
git clone https://github.com/Agrid-Dev/gridone
cd gridone
uv sync
uv run fastapi dev apps/api_server/main.py
```

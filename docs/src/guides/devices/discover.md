# Discover Devices

## Background

[Discovery](../../reference/glossary.md#discovery) listens on an MQTT [network](../../reference/glossary.md#network) for announcements from devices matching a specific [driver](../../reference/glossary.md#driver). Any announcing [device](../../reference/glossary.md#device) is automatically registered in Gridone — no manual config entry required per device.

> Discovery only works with MQTT-based drivers and networks.

---

## Prerequisites

- An MQTT network already registered in Gridone.
- An MQTT-based driver already registered in Gridone.

---

## Enable discovery when adding a device

1. From the sidebar, click **Devices**, then click **Add** in the page header.
2. Select an MQTT-based driver from the **Driver** dropdown.
3. Select an MQTT network from the **Network** dropdown.
4. The **Discover devices like me** toggle appears — enable it. This instructs Gridone to listen on the selected network and auto-import devices that match the selected driver.
5. Click **Create device**.

Discovery is activated after the device is saved. New devices announcing on the same network and matching the same driver appear automatically in the **Devices** list.

---

## Enable or disable discovery on an existing device

Open a device from the **Devices** list and click **Edit**. If the device uses an MQTT-based driver and network, the **Discover devices like me** toggle is shown. Toggling it takes effect immediately without saving the form.

---

## Stop discovery

Open the device in edit mode and disable the **Discover devices like me** toggle. Discovery stops immediately and no further devices are auto-imported.

# Add a Device

## Background

A [driver](../../reference/glossary.md#driver) describes a device model — its [attributes](../../reference/glossary.md#attribute), how to read and write them, and which protocol it uses. A [network](../../reference/glossary.md#network) is the connection channel that carries communication to and from the device.

---

## Add a device

From the sidebar, click **Devices**, then click **Add** in the page header. The **Create Device** form opens.

### Device name

Enter a name to identify this device in Gridone.

### Driver

Select a driver from the **Driver** dropdown. Each entry shows the driver ID, the device model details, and its protocol. Selecting a driver filters the **Network** dropdown to only show compatible networks and reveals the config fields for that driver.

### Network

Select the network this device is connected to from the **Network** dropdown. Only networks whose protocol matches the selected driver are shown. 

If no suitable network exists yet, click **+ Create new network** to create one inline without leaving the form.

### Config fields

[Config fields](../../reference/glossary.md#device-config) appear once a driver is selected. Each field is a parameter the driver uses to address this specific unit — for example, a Modbus or MQTT driver shows a **Device Id** field, while an HTTP driver shows an **Ip** field. The available fields and their expected values depend on the selected driver.

If the selected driver has no config fields, **No configuration** is shown instead.

### Save

Click **Create device**. The device appears in the **Devices** list.

---

## Verify the device is connected

Open the device from the list. The **Attributes** section shows a card for each attribute. Once the network is connected and Gridone begins polling, each card displays the attribute's live current value. If the network is unreachable, the current value remains empty.

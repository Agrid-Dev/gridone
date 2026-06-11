# Create an Automation

## Background

An [automation](../../reference/glossary.md#automation) is a rule that fires an [action](../../reference/glossary.md#action) when a condition ([trigger](../../reference/glossary.md#trigger)) is met. Each run is recorded as an [execution](../../reference/glossary.md#execution).

---

## Automations list

Click **Automations** in the sidebar to see all automations. The list shows each automation's name, trigger type, and current status — **Enabled** or **Disabled**.

---

## Create an automation

From the Automations list, click **New automation**. The wizard walks you through three following steps.

### Step 1 — Automation

Enter a **Name** (required) and an optional **Description** for your automation template. Use the **Enabled** toggle to choose whether the automation starts active immediately or stays disabled until you enable it later.

Click **Next**.

### Step 2 — Trigger

Select a trigger type from the dropdown, then fill in its configuration. There are two following trigger types:

**Schedule**

Enter a cron expression — a short pattern (e.g. `0 8 * * *` for every day at 8 AM) that defines when the automation fires.

**Attribute change**

Select a device and one of its attributes. Optionally add a condition: choose a comparison operator and a threshold value. When the attribute's value changes and the condition is met (or no condition is set), the automation fires.

Click **Next**.

### Step 3 — Action

Select an action type from the dropdown — **Run a command** or **Send a notification** — then configure it.

**Run a command**

Choose a command source:

- **Use a saved template** — pick an existing [command template](../commands/templates.md) from the list. The command is dispatched to its saved target each time the automation fires.
- **Define a new command** — opens the [command wizard](../commands/send-command.md) inline. Configure the target and command as usual, then click **Use this command**.

**Send a notification**

Enter a **Title** (required) and an optional **Message** (Markdown supported). Select a **Severity** and pick at least one **Recipient**.

Click **Submit**. The automation appears in the list.

---

## Enable and disable

**From the list** — click the row menu (⋯) on any automation and select **Enable** or **Disable**.

**From the detail page** — click **Edit automation** on the Automation card, toggle the **Enabled** switch, and click **Save**.

---

## Edit trigger or action

Open an automation from the list. The **Trigger** and **Action** cards each have an **Edit** button. Click it to edit that section inline. Click **Save** to apply or **Cancel** to discard. Only one section can be in edit mode at a time.

---

## Delete an automation

Open the automation's detail page. In the **Danger Zone** at the bottom of the page, click **Delete** and confirm. Note that this action cannot be undone.

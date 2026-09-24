# Create an Automation

## Background

An [automation](../../reference/glossary.md#automation) reacts to one [trigger](../../reference/glossary.md#trigger) by choosing one [action](../../reference/glossary.md#action) in a decision tree: cases are tested in order, and the first true case decides what runs. Each run is recorded as an [execution](../../reference/glossary.md#execution).

---

## Automations list

Click **Automations** in the sidebar to see all automations. Each card shows the automation's name, its trigger, its action (or its number of cases when it holds a decision), its status badge, the switch that enables or disables it, and a pencil that opens the editor.

---

## Create an automation

From the Automations list, click **New automation**. The editor opens on a blank tree — a **When** node waiting for a trigger and one path waiting for an action — next to a side panel where the selected element is edited. One **Create the automation** button saves the whole draft.

### Name it

The side panel opens on the automation itself. Enter a **Name** (required) and an optional **Description**. **Enable as soon as it is saved** decides whether the automation starts listening right away or stays disabled until you enable it.

### Choose the trigger

Select the **When** node and pick a trigger type.

**Schedule**

Enter a cron expression — a short pattern (e.g. `0 8 * * *` for every day at 8 AM) that defines when the automation fires.

**Attribute change**

Select a device and one of its attributes. Optionally add a comparison: an operator and a threshold the new value must satisfy. The automation fires when the attribute's value changes. The first value observed after a start, a reconnection or an unavailable value (an invalid measurement) only initializes the automation: it never fires it, even when that value differs from the last one known.

### Add cases

By default the trigger leads straight to an action. To decide between several actions, click **Add a condition** on the path, or **Add a case** on an existing decision. Each case has an optional name and a condition written in the same language as [operating rules](../commands/operating-rules.md): comparisons and combinations over any device attribute — the triggering device's or another one's — and over the event itself (its device, its attribute, the previous value and the new value).

Cases are tested left to right and the first true case is followed. **Otherwise** always comes last: by default it does nothing (the run is still recorded as *No case was true*), or it can run an action of its own. A case can also lead to another decision instead of an action. When a condition reads a value that is unknown or stale, the run stops without doing anything and says why.

### Choose the actions

Select an action node and pick an action type.

**Run a command**

Choose a command source:

- **Use a saved template** — pick an existing [command template](../commands/templates.md) from the list. The command is dispatched to its saved target each time the case is chosen.
- **Define a new command** — opens the [command wizard](../commands/send-command.md) inline. Configure the target and the command as usual, then click **Use this command**.
- **Write one attribute** — one value written to one attribute, on a chosen device or on the device that triggered the run.

A command run by an automation is sent without waiting for the device to confirm it. It appears under **History > Commands** with the value it requested; the device's own value only changes once the device reports it again, so charts and history show what the device did, never what was asked. A command the device's driver rules or an operating rule refuse is recorded there too, in error, with the reason, and the run is marked as refused.

**Send a notification**

Enter a **Title** (required) and an optional **Message** (Markdown supported). Select a **Severity** and pick at least one **Recipient**.

Click **Create the automation**. The editor opens on the saved automation.

---

## Enable and disable

The switch on a card, or in the editor header, enables or disables the whole automation. Disabling asks for an optional reason; the reason, who disabled the automation and when stay visible in a banner on its page until it is enabled again. Enabling resumes listening: it sends no command and does not replay the events missed while disabled.

The circuit breaker disables an automation on its own when it misbehaves: too many runs in a short window, repeated failures, or an action that would write the very attribute that triggered it. The banner then names the guard that tripped. Re-enabling is manual.

---

## Edit an automation

Open an automation from the list. Every element of the tree is edited in the side panel, and the header shows **Unsaved changes** until you click **Save changes** or **Cancel**. Cases are reordered from a decision's **Test order** panel, or from a case's own menu.

---

## Delete an automation

Select the automation node. At the bottom of its panel, click **Delete** and confirm. The execution history is kept. Note that this action cannot be undone.

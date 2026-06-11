# Command Templates

## Background

A [template](../../reference/glossary.md#template) saves a command configuration — target, attribute, and value — so that the command can be dispatched to target devices without re-entering the details each time.

---

## Create a template

Use any entry point to open the [command wizard](send-command.md). In the **Review step**, enter a name in the template name field and click **Save as template**. You are taken directly to the new template's detail page.

---

## Templates list

Go to **Devices > Commands > Templates** to see all saved templates. The table shows each template's name, target, payload, creator, and creation date. Click a row to open its detail page.

---

## Template detail page

The detail page shows the template's target and payload, and two additional sections:

**Resolved devices** — the list of devices the template currently targets. Because filters (zone, device type) are re-evaluated at each dispatch, this list may change over time as zone membership changes. The **Execute** button is disabled when the target resolves to no devices.

**Previous executions** — a read-only history of every dispatch triggered from this template, showing device, attribute, value, status, and timestamp.

### Execute

Click **Execute** in the page header to dispatch the command to all currently resolved devices. A toast confirms the commands were dispatched.

### Delete

Click **Delete** in the page header and confirm. The template is removed and no further executions are possible from it. Previous executions remain visible in the Commands list for audit purposes.

# Execution History

Every time an [automation](../../reference/glossary.md#automation) fires, Gridone records the run as an [execution](../../reference/glossary.md#execution).

---

## View executions

Open an automation from the **Automations** list and switch the side panel to **Runs**. Each entry shows when the run happened, how it ended, the cases it followed and the action it reached.

| Outcome | Meaning |
| -- | -- |
| Succeeded | A case was true and its action was dispatched. |
| Failed | The action could not be dispatched, or a condition read an unknown or stale value; the entry says which. |
| Refused by a rule | The write was refused by the device's rules or by an operating rule. The refusal is recorded under **History > Commands**. |
| No case was true | Every case was false and *Otherwise* does nothing. |
| First observation | The first value after a start, a reconnection or an unavailable value: the automation initialized without acting. |
| Circuit breaker tripped | The run tripped a guard and the automation was disabled; the banner on its page names the guard. |
| Skipped | The event arrived while the previous run was still in progress. Nothing was dispatched and the automation stays enabled. |

Pick a run to replay it on the tree: the cases that were tested, the one that was followed and the action that ran are highlighted, and the arrows step through older and newer runs.

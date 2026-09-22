# Operating rules

`OperatingRulesService` owns deployment-level rules guarding explicit device writes.
`OperatingRuleGuard` owns evaluation and implements the generic `WritePolicy` hook.
The composition root injects the guard into devices manager and its attribute
inspector/resolver into operating rules. No site, group, automation or driver owns these rules.

Configuration is restricted to administrators at the HTTP boundary. Rules can be
disabled, reactivated or deleted with a revision check. Deletion removes the rule
from configuration while preserving its history. Every revision retains its actor
and timestamp. Missing or changed attributes remain visible in diagnostics and must be
repaired before reactivation. The legacy retirement endpoint remains compatible.

See `docs/specs/adr/0006-site-operating-rules.md` for semantics and concurrency limits.

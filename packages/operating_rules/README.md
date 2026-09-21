# Operating rules

`OperatingRulesService` owns deployment-level rules guarding explicit device writes.
The composition root injects its rule provider into devices and the devices point
inspector into this service. No site, group, automation or driver owns these rules.

Configuration is restricted to administrators at the HTTP boundary. Retirement
requires a reason and keeps the rule, actor and timestamp; there is no pause switch.
Every revision is retained. Missing or changed points remain visible in diagnostics.

See `docs/specs/adr/0006-site-operating-rules.md` for semantics and concurrency limits.

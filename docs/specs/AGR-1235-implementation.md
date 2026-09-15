# AGR-1235 — implementation plan updated against main

Baseline: `b0faca1e` (v0.239.0), fetched from `origin/main` before implementation.
AGR-1231 is already integrated; keep its frozen destinations, single-use preparation
tokens, user binding and selection revalidation.

Scope: AGR-1235 with AGR-1236–1239. Full thermostat driver migration (AGR-1243) and
additional confirmation UI (AGR-1240) remain separate deliveries.

1. Add typed expressions, rules, options and defaults; validate local references,
   scalar types, cycles and resource limits at driver import/edit.
2. Resolve per-device value mappings above composable codecs, preserve raw codes,
   reinterpret table updates and make reverse mapping deterministic.
3. Guard the common CoreDevice write path from current observations without I/O;
   serialize writes, expire knowledge after one expected push interval, record
   submitted refusals directly as terminal errors, and expose previews/projections.
4. Connect SDK, WebSocket and all UI writers/controls to the server contract;
   show unavailable options and localized reasons, support server-resolved layouts,
   and remove invented mode defaults.
5. Verify pure evaluation, driver lifecycle, device acquisition/write races,
   command history/storage, API authorization, UI accessibility and regression gates.

The authoring and runtime contract is documented in
`../src/reference/driver-schema/command-validation.md`.

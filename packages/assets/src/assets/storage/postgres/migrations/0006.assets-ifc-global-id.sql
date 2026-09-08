-- depends: 0005.assets-usage

-- Guarded because this migration was renumbered: it shipped as
-- 0005.assets-ifc-global-id before 0005.assets-usage landed on main, so a
-- database that ran the earlier branch already carries the column under the
-- old id. yoyo keys the ledger on the migration id alone, so it replays this
-- one there; the guard makes that replay a no-op instead of a failed boot.
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS ifc_global_id TEXT;

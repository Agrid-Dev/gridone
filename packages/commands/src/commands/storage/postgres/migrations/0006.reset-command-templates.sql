-- depends: 0005.drop-legacy-ts-device-commands-fk

-- Command targets become typed (models.targets.DevicesFilter: ids/types/tags
-- only). Rather than carrying translation code for the historical superset
-- shape (asset_id alias, runtime filter keys), existing templates are wiped —
-- saved templates are cheap to recreate and every batch dispatch makes a new
-- ephemeral one. Command history survives: unit_commands.template_id nulls
-- out via its ON DELETE SET NULL foreign key.
DELETE FROM command_templates;

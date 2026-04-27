-- depends: 0001.automations-initial

ALTER TABLE automations ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE automations ALTER COLUMN title DROP DEFAULT;
ALTER TABLE automations ADD COLUMN description TEXT NOT NULL DEFAULT '';

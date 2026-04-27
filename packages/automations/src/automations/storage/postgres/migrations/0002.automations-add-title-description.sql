-- depends: 0001.automations-initial

ALTER TABLE automations ADD COLUMN description TEXT NOT NULL DEFAULT '';

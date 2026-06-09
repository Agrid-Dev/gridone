-- depends: 0002.assets-add-position

CREATE TABLE IF NOT EXISTS building_profile (
    id    TEXT PRIMARY KEY,
    data  JSONB NOT NULL
);

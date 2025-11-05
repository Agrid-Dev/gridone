from pathlib import Path

import yaml


def read_raw_schema(path: Path) -> dict:
    with path.open("r") as f:
        return yaml.safe_load(f)


MY_DRIVER = Path(".db/drivers/open_meteo.yaml")

if __name__ == "__main__":
    schema_data = read_raw_schema(MY_DRIVER)
    print(schema_data)

from pathlib import Path

import yaml

from core.driver import Driver


def read_raw_schema(path: Path) -> dict:
    with path.open("r") as f:
        return yaml.safe_load(f)


def load_driver(path: Path) -> Driver:
    schema_data = read_raw_schema(path)
    return Driver.from_dict(schema_data)


if __name__ == "__main__":
    MY_DRIVER = Path(".db/drivers/open_meteo.yaml")
    driver = load_driver(MY_DRIVER)
    print(driver)

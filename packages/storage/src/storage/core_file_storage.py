from pathlib import Path

from .yaml_file_storage import YamlFileStorage


class CoreFileStorage:
    """A basic file storage system for the core."""

    _root_dir: Path
    drivers: YamlFileStorage[dict]
    devices: YamlFileStorage[dict]
    transport_configs: YamlFileStorage[dict]

    def __init__(self, root_dir: str | Path) -> None:
        self._root_dir = Path(root_dir)
        self.drivers = YamlFileStorage[dict](self._root_dir / "drivers")
        self.devices = YamlFileStorage[dict](self._root_dir / "devices")
        self.transport_configs = YamlFileStorage[dict](
            self._root_dir / "transport_configs"
        )

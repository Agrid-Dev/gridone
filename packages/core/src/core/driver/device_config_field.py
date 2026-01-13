from dataclasses import dataclass


@dataclass
class DeviceConfigField:
    name: str
    required: bool = True

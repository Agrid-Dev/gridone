from datetime import datetime

from devices_manager.core.device import Device
from rich.table import Table


def autoformat_value(value: float | bool | str | None) -> str:  # noqa: FBT001
    if isinstance(value, int):
        return f"{value}"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


RECENT_TRESHOLD = 5


def is_recent(dt: datetime | None, treshold: float = RECENT_TRESHOLD) -> bool:
    if not dt:
        return False
    return (datetime.now(tz=dt.tzinfo) - dt).total_seconds() < treshold


def device_to_table(device: Device) -> Table:
    table = Table(show_header=True, header_style="bold blue")
    table.add_column("Attribute")
    table.add_column("Value")
    for attribute in device.attributes.values():
        value = autoformat_value(attribute.current_value)
        if is_recent(attribute.last_changed):
            table.add_row(attribute.name, f"[bold yellow]{value}[/bold yellow]")
        else:
            table.add_row(attribute.name, value)
    return table

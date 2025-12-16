"""
Command group for devices.
"""

import asyncio

import typer
from core.devices_manager import DevicesManager
from rich.console import Console
from rich.live import Live
from rich.table import Table
from storage.core_file_storage import CoreFileStorage

from cli.repository import gridone_repository  # ty: ignore[unresolved-import]

from .formatters import autoformat_value, device_to_table

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.callback()
def _init(ctx: typer.Context) -> None:
    ctx.ensure_object(dict)
    ctx.obj.setdefault("repository", gridone_repository)


def get_single_device_manager(
    repository: CoreFileStorage, device_id: str
) -> DevicesManager:
    device_raw = repository.devices.read(device_id)
    driver_raw = repository.drivers.read(device_raw["driver"])
    if device_raw.get("transport_config"):
        transport_configs = [
            repository.transport_configs.read(device_raw["transport_config"])
        ]
    return DevicesManager.load_from_raw([device_raw], [driver_raw], transport_configs)


async def _read_device_async(repository: CoreFileStorage, device_id: str) -> None:
    """
    Async implementation that performs device manager initialization and
    reads attributes from the device using async drivers/transports.
    """
    device = repository.load_device(device_id)
    console.print(
        f"Reading device [bold blue]{device_id}[/bold blue]"
        f" with driver [bold blue]{device.driver.name}[/bold blue]"
    )
    # Use the async transport context manager inside the coroutine
    async with device.driver.transport:
        for attribute in device.attributes:
            value = await device.read_attribute_value(attribute)
            console.print(f"{attribute}: {autoformat_value(value)}")


@app.command("list")
def list_all(ctx: typer.Context) -> None:
    repository = ctx.obj["repository"]
    devices = repository.devices.read_all()
    print(f"Read {len(devices)} devices")
    table = Table(title=f"Devices ({len(devices)})")
    table.add_column("ID", justify="left", style="cyan", no_wrap=True)
    table.add_column("Driver", justify="left", style="magenta")
    table.add_column("Transport Config", justify="left", style="green")

    for device_raw in sorted(devices, key=lambda d: d["id"]):
        table.add_row(
            device_raw["id"],
            device_raw["driver"],
            device_raw.get("transport_config"),
        )

    console.print(table)


@app.command()
def read(ctx: typer.Context, device_id: str) -> None:
    """
    Read all attributes from a device.
    """
    asyncio.run(_read_device_async(ctx.obj["repository"], device_id))


async def _write_device_async(
    repository: CoreFileStorage,
    device_id: str,
    attribute: str,
    value: float,
) -> None:
    device = repository.load_device(device_id)
    console.print(
        f"Writing value [bold red]{value}[/bold red] to device"
        f" [bold blue]{device_id}[/bold blue]"
        f" with driver [bold blue]{device.driver.name}[/bold blue]"
    )
    async with device.driver.transport:
        await device.write_attribute_value(attribute, value)
        console.print("[bold green]Attrubute updated[/bold green]")


@app.command()
def write(
    ctx: typer.Context,
    device_id: str,
    attribute: str,
    value: float,
) -> None:
    """Update a device attribute.
    For boolean values, use 0 or 1. String values are not supported yet."""
    asyncio.run(
        _write_device_async(
            ctx.obj["repository"],
            device_id,
            attribute,
            value,
        )
    )


async def _watch_device(repository: CoreFileStorage, device_id: str) -> None:
    dm = get_single_device_manager(repository, device_id)
    await dm.start_polling()
    device = dm.devices[device_id]
    console.print(
        f"Watching device [bold blue]{device_id}[/bold blue] using driver "
        f"[bold blue]{device.driver.name}[/bold blue] (press Ctrl+C to quit)"
    )

    try:
        async with device.driver.transport:
            await device.init_listeners()
            # Read initial values
            for attribute in device.attributes:
                await device.read_attribute_value(attribute)

            current = None
            with Live(auto_refresh=False) as live:
                while True:  # Loop until KeyboardInterrupt
                    new = device_to_table(device)
                    if new != current:
                        live.update(new)
                        live.refresh()
                        current = new
                    await asyncio.sleep(0.2)
    except KeyboardInterrupt:
        await dm.stop_polling()
        console.print("\n👋 Goodbye")


@app.command()
def watch(ctx: typer.Context, device_id: str) -> None:
    """Continuously monitor device attributes."""
    asyncio.run(_watch_device(ctx.obj["repository"], device_id))

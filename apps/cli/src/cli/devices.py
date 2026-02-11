"""
Command group for devices.
"""

import asyncio
from typing import Annotated

import typer
from devices_manager import DevicesManager
from devices_manager.storage.core_file_storage import CoreFileStorage
from rich.console import Console
from rich.live import Live
from rich.table import Table

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
    device_dto = repository.devices.read(device_id)
    driver_dto = repository.drivers.read(device_dto.driver_id)
    transport_dto = repository.transports.read(device_dto.transport_id)
    return DevicesManager.from_dto([device_dto], [driver_dto], [transport_dto])


async def _read_device_async(repository: CoreFileStorage, device_id: str) -> None:
    """
    Async implementation that performs device manager initialization and
    reads attributes from the device using async drivers/transports.
    """
    device = get_single_device_manager(repository, device_id).devices[device_id]
    console.print(
        f"Reading device [bold blue]{device_id}[/bold blue]"
        f" with driver [bold blue]{device.driver.name}[/bold blue]"
    )
    # Use the async transport context manager inside the coroutine
    async with device.transport:
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
    table.add_column("Transport", justify="left", style="green")

    for device_raw in sorted(devices, key=lambda d: d.id):
        table.add_row(
            device_raw.id,
            device_raw.driver_id,
            device_raw.transport_id,
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
    device = get_single_device_manager(repository, device_id).devices[device_id]
    console.print(
        f"Writing value [bold red]{value}[/bold red] to device"
        f" [bold blue]{device_id}[/bold blue]"
        f" with driver [bold blue]{device.driver.name}[/bold blue]"
    )
    async with device.transport:
        await device.write_attribute_value(attribute, value)
        console.print("[bold green]Attribute updated[/bold green]")


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
        async with device.transport:
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


async def _discover(
    repository: CoreFileStorage, driver_id: str, transport_id: str
) -> None:
    dm = DevicesManager.from_dto(
        repository.devices.read_all(),
        repository.drivers.read_all(),
        repository.transports.read_all(),
    )
    if driver_id not in dm.driver_ids:
        msg = f"Driver {driver_id} does not exist"
        raise ValueError(msg)
    if transport_id not in dm.transports:
        msg = f"Transport {transport_id} does not exist"
        raise ValueError(msg)
    device_ids = {d.id for d in dm.devices.values()}
    await dm.discovery_manager.register(driver_id=driver_id, transport_id=transport_id)

    console.print("Starting device discovery (press Ctrl+C to quit)")

    await dm.discovery_manager.register(driver_id=driver_id, transport_id=transport_id)
    try:
        with Live(auto_refresh=False):
            while True:
                new_device_ids = {d.id for d in dm.devices.values()} - device_ids
                if new_device_ids:
                    for new_device_id in new_device_ids:
                        device = dm.devices[new_device_id]
                        console.print(
                            "New device discovered: "
                            f"[bold green]{device.id}[/bold green]"
                            f" with config {device.config}"
                        )
                    device_ids.update(new_device_ids)
                await asyncio.sleep(1)
    except KeyboardInterrupt:
        console.print("\n👋 Discovery stopped")


@app.command(help="Listen for new devices for a driver on a push transport client.")
def discover(
    ctx: typer.Context,
    driver_id: Annotated[
        str,
        typer.Option(
            "-d", "--driver_id", help="Id of the driver. Driver must support discovery."
        ),
    ],
    transport_id: Annotated[
        str,
        typer.Option(
            "-t",
            "--transport_id",
            help="Id of the transport to listen on. Must be a push transport.",
        ),
    ],
) -> None:
    asyncio.run(_discover(ctx.obj["repository"], driver_id, transport_id))

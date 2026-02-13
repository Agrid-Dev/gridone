"""
Command group for devices.
"""

import asyncio
from typing import Annotated

import typer
from devices_manager import DevicesManager
from rich.console import Console
from rich.live import Live
from rich.table import Table

from cli.config import get_database_url  # ty: ignore[unresolved-import]

from .formatters import autoformat_value, device_to_table

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.callback()
def _init(ctx: typer.Context) -> None:
    ctx.ensure_object(dict)
    ctx.obj.setdefault(
        "dm",
        asyncio.run(DevicesManager.from_postgres(get_database_url())),
    )


@app.command("list")
def list_all(ctx: typer.Context) -> None:
    dm: DevicesManager = ctx.obj["dm"]
    devices = dm.list_devices()
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


async def _read_device_async(dm: DevicesManager, device_id: str) -> None:
    """
    Async implementation that performs device manager initialization and
    reads attributes from the device using async drivers/transports.
    """
    console.print(f"Reading device [bold blue]{device_id}[/bold blue]")
    device = await dm.read_device(device_id)
    for attribute in device.attributes.values():
        console.print(f"{attribute.name}: {autoformat_value(attribute.current_value)}")


@app.command()
def read(ctx: typer.Context, device_id: str) -> None:
    """
    Read all attributes from a device.
    """
    asyncio.run(_read_device_async(ctx.obj["dm"], device_id))


async def _write_device_async(
    dm: DevicesManager,
    device_id: str,
    attribute: str,
    value: float,
) -> None:
    device = dm.get_device(device_id)
    driver = dm.get_driver(device.driver_id)
    console.print(
        f"Writing value [bold red]{value}[/bold red] to device"
        f" [bold blue]{device_id}[/bold blue]"
        f" with driver [bold blue]{driver.id}[/bold blue]"
    )

    await dm.write_device_attribute(device_id, attribute, value)
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
            ctx.obj["dm"],
            device_id,
            attribute,
            value,
        )
    )


async def _watch_device(dm: DevicesManager, device_id: str) -> None:
    await dm.start_polling()
    device = dm.get_device(device_id)
    console.print(
        f"Watching device [bold blue]{device_id}[/bold blue] using driver "
        f"[bold blue]{device.driver_id}[/bold blue] (press Ctrl+C to quit)"
    )

    try:
        current = None
        with Live(auto_refresh=False) as live:
            while True:  # Loop until KeyboardInterrupt
                new = device_to_table(dm.get_device(device_id))
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
    asyncio.run(_watch_device(ctx.obj["dm"], device_id))


async def _discover(dm: DevicesManager, driver_id: str, transport_id: str) -> None:
    device_ids = dm.device_ids

    console.print("Starting device discovery (press Ctrl+C to quit)")

    await dm.discovery_manager.register(driver_id=driver_id, transport_id=transport_id)
    try:
        with Live(auto_refresh=False):
            while True:
                new_device_ids = dm.device_ids - device_ids
                if new_device_ids:
                    for new_device_id in new_device_ids:
                        device = dm.get_device(new_device_id)
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
    asyncio.run(_discover(ctx.obj["dm"], driver_id, transport_id))

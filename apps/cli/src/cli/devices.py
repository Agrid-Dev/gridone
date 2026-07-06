"""
Command group for devices.
"""

import asyncio

import typer
from rich.console import Console
from rich.live import Live
from rich.table import Table

from cli.service import run_async, service
from devices_manager import CoreDevice, DevicesService

from .formatters import autoformat_value, device_to_table

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.command("list")
@run_async
async def list_all() -> None:
    """List all devices."""
    async with service() as svc:
        devices = svc.list_devices()
        table = Table(title=f"Devices ({len(devices)})")
        table.add_column("ID", justify="left", style="cyan", no_wrap=True)
        table.add_column("Driver", justify="left", style="magenta")
        table.add_column("Transport", justify="left", style="green")
        for device in sorted(devices, key=lambda d: d.id):
            table.add_row(device.id, device.driver_id, device.transport_id)
        console.print(table)


async def _read_device_async(dm: DevicesService, device_id: str) -> None:
    console.print(f"Reading device [bold blue]{device_id}[/bold blue]")
    device = await dm.read_device(device_id)
    for attribute in device.attributes.values():
        console.print(f"{attribute.name}: {autoformat_value(attribute.current_value)}")


@app.command()
@run_async
async def read(device_id: str) -> None:
    """Read all attributes from a device."""
    async with service() as svc:
        await _read_device_async(svc, device_id)


async def _write_device_async(
    dm: DevicesService,
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
@run_async
async def write(
    device_id: str,
    attribute: str,
    value: float,
) -> None:
    """Update a device attribute.
    For boolean values, use 0 or 1. String values are not supported yet."""
    async with service() as svc:
        await _write_device_async(svc, device_id, attribute, value)


async def _watch_device(dm: DevicesService, device_id: str) -> None:
    console.print(
        f"Watching device [bold blue]{device_id}[/bold blue] (press Ctrl+C to quit)"
    )

    updated = asyncio.Event()

    def _on_update(device: CoreDevice, *_: object) -> None:
        if device.id == device_id:
            updated.set()

    listener_id = dm.add_device_attribute_listener(_on_update)
    await dm.start_device_sync(device_id)
    try:
        table = device_to_table(dm.get_device(device_id))
        with Live(table, auto_refresh=False) as live:
            while True:  # Loop until KeyboardInterrupt
                await updated.wait()
                updated.clear()
                live.update(device_to_table(dm.get_device(device_id)))
                live.refresh()
    except KeyboardInterrupt:
        console.print("\n👋 Goodbye")
    finally:
        dm.remove_device_attribute_listener(listener_id)
        await dm.stop_device_sync(device_id)


@app.command()
@run_async
async def watch(device_id: str) -> None:
    """Continuously monitor device attributes."""
    async with service() as svc:
        await _watch_device(svc, device_id)

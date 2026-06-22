"""
Command group for devices.
"""

import asyncio
from typing import Annotated

import typer
from rich.console import Console
from rich.live import Live
from rich.table import Table

from cli.service import service
from devices_manager import DevicesService

from .formatters import autoformat_value, device_to_table

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.command("list")
def list_all() -> None:
    """List all devices."""

    async def _run() -> None:
        async with service() as svc:
            devices = svc.list_devices()
            table = Table(title=f"Devices ({len(devices)})")
            table.add_column("ID", justify="left", style="cyan", no_wrap=True)
            table.add_column("Driver", justify="left", style="magenta")
            table.add_column("Transport", justify="left", style="green")
            for device in sorted(devices, key=lambda d: d.id):
                table.add_row(device.id, device.driver_id, device.transport_id)
            console.print(table)

    asyncio.run(_run())


async def _read_device_async(dm: DevicesService, device_id: str) -> None:
    console.print(f"Reading device [bold blue]{device_id}[/bold blue]")
    device = await dm.read_device(device_id)
    for attribute in device.attributes.values():
        console.print(f"{attribute.name}: {autoformat_value(attribute.current_value)}")


@app.command()
def read(device_id: str) -> None:
    """
    Read all attributes from a device.
    """

    async def _run() -> None:
        async with service() as svc:
            await _read_device_async(svc, device_id)

    asyncio.run(_run())


async def _write_device_async(
    dm: DevicesService,
    device_id: str,
    attribute: str,
    value: float,
) -> None:
    device = dm.get_device(device_id)
    if device.driver_id is None:
        msg = "Cannot write to a virtual device"
        raise TypeError(msg)
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
    device_id: str,
    attribute: str,
    value: float,
) -> None:
    """Update a device attribute.
    For boolean values, use 0 or 1. String values are not supported yet."""

    async def _run() -> None:
        async with service() as svc:
            await _write_device_async(svc, device_id, attribute, value)

    asyncio.run(_run())


async def _watch_device(dm: DevicesService, device_id: str) -> None:
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
        console.print("\n👋 Goodbye")


@app.command()
def watch(device_id: str) -> None:
    """Continuously monitor device attributes."""

    async def _run() -> None:
        async with service(sync=True) as svc:
            await _watch_device(svc, device_id)

    asyncio.run(_run())


async def _discover(dm: DevicesService, driver_id: str, transport_id: str) -> None:
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
    async def _run() -> None:
        async with service(sync=True) as svc:
            await _discover(svc, driver_id, transport_id)

    asyncio.run(_run())

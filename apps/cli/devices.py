"""
Command group for devices.
"""

import asyncio

import typer
from core.devices_manager import DevicesManager
from repository import gridone_repository  # ty: ignore[unresolved-import]
from rich.console import Console
from rich.table import Table
from storage.core_file_storage import CoreFileStorage

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.callback()
def _init(ctx: typer.Context) -> None:
    ctx.ensure_object(dict)
    ctx.obj.setdefault("repository", gridone_repository)


def autoformat_value(value: float | bool | str | None) -> str:  # noqa: FBT001
    if isinstance(value, int):
        return f"{value}"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


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


async def _write_device_async(  # noqa: PLR0913
    repository: CoreFileStorage,
    device_id: str,
    attribute: str,
    value: float,
    *,
    confirm: bool = True,
    confirm_delay: float = 0.25,
) -> None:
    device = repository.load_device(device_id)
    console.print(
        f"Writing value [bold red]{value}[/bold red] to device"
        f" [bold blue]{device_id}[/bold blue]"
        f" with driver [bold blue]{device.driver.name}[/bold blue]"
    )
    async with device.driver.transport:
        await device.write_attribute_value(attribute, value)
        if confirm:
            await asyncio.sleep(confirm_delay)
            confirm_value = await device.read_attribute_value(attribute)
            if confirm_value == type(confirm_value)(value):
                console.print(
                    f"[bold green]Confirmed[/bold green] ({attribute}={confirm_value})"
                )
            else:
                msg = f"Write failed: {attribute} {confirm_value}!={value}"
                raise ValueError(msg)
        else:
            console.print("[bold green]Successfully sent[/bold green] (no confirm)")


@app.command()
def write(  # noqa: PLR0913
    ctx: typer.Context,
    device_id: str,
    attribute: str,
    value: float,
    *,
    confirm: bool = True,
    confirm_delay: float = 0.25,
) -> None:
    """Update a device attribute.
    For boolean values, use 0 or 1. String values are not supported yet."""
    asyncio.run(
        _write_device_async(
            ctx.obj["repository"],
            device_id,
            attribute,
            value,
            confirm=confirm,
            confirm_delay=confirm_delay,
        )
    )


async def _watch_device(repository: CoreFileStorage, device_id: str) -> None:
    dm = get_single_device_manager(repository, device_id)
    await dm.start_polling()
    device = dm.devices[device_id]
    console.print(
        f"Watching device [bold blue]{device_id}[/bold blue] using driver"
        f" [bold blue]{device.driver.name}[/bold blue] (enter 'q' to quit)"
    )

    async with device.driver.transport:
        console.print("Initializing current values...")
        for attribute in device.attributes:
            await device.read_attribute_value(attribute)

        def stringify_device() -> str:
            attributes_str = [
                f"{attribute.name}: {autoformat_value(attribute.current_value)}"
                for attribute in device.attributes.values()
            ]
            return " - ".join(attributes_str)

        current = stringify_device()
        console.print(current)

        # Create an event to signal when to stop
        stop_event = asyncio.Event()

        async def _input_listener() -> None:
            while not stop_event.is_set():
                user_input = await asyncio.get_event_loop().run_in_executor(None, input)
                if user_input.strip().lower() == "q":
                    console.print("👋 goodbye")
                    await dm.stop_polling()
                    stop_event.set()
                    return
                await asyncio.sleep(0.1)

        async def _attribute_watcher() -> None:
            nonlocal current
            while not stop_event.is_set():
                new = stringify_device()
                if new != current:
                    console.print(new)
                    current = new
                await asyncio.sleep(0.2)

        # Run both coroutines concurrently
        await asyncio.gather(
            _input_listener(),
            _attribute_watcher(),
        )


@app.command()
def watch(ctx: typer.Context, device_id: str) -> None:
    """Continuously monitor device attributes."""
    asyncio.run(_watch_device(ctx.obj["repository"], device_id))

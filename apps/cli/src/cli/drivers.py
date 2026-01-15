import asyncio
from typing import TYPE_CHECKING, Annotated

import typer
from core.driver import Driver
from core.transports import (
    PushTransportClient,
)
from core.types import AttributeValueType, DeviceConfig, TransportProtocols
from dto.driver_dto import dto_to_core as driver_dto_to_core
from dto.transport_dto import dto_to_core as transport_dto_to_core
from rich.console import Console

from cli.repository import gridone_repository  # ty: ignore[unresolved-import]

if TYPE_CHECKING:
    from storage import CoreFileStorage

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.callback()
def _init(ctx: typer.Context) -> None:
    ctx.ensure_object(dict)
    ctx.obj.setdefault("repository", gridone_repository)


@app.command("list")
def list_all(ctx: typer.Context) -> None:
    repository: CoreFileStorage = ctx.obj["repository"]
    drivers = repository.drivers.read_all()
    for driver in drivers:
        console.print(driver.id)


def on_discover_device(
    device_config: DeviceConfig, attributes: dict[str, AttributeValueType]
) -> None:
    message = "New device discovered !\n"
    for k, v in device_config.items():
        message += f"  \\[config] {k}: {v}\n"
    for k, v in attributes.items():
        message += f"  \\[attribute] {k}: {v}\n"
    console.print(message)


async def _run_discovery(driver: Driver, transport: PushTransportClient) -> None:
    task = asyncio.create_task(
        driver.discover(transport, on_discover_device, timeout=600)
    )
    try:
        console.print(f"Listening for new devices on driver {driver.name}...\n\n")
        await asyncio.Future()
    except KeyboardInterrupt:
        console.print("\nExit")
        task.cancel()


@app.command()
def discover(
    ctx: typer.Context,
    driver_id: str,
    transport_id: Annotated[
        str | None,
        typer.Option(
            "--transport-config",
            "-t",
            help="A transport config if required for the transport",
        ),
    ] = None,
) -> None:
    repository: CoreFileStorage = ctx.obj["repository"]

    try:
        driver_raw = repository.drivers.read(driver_id)
    except FileNotFoundError as e:
        console.print(f"[bold red]Driver not found: {driver_id}[/bold red]")
        raise typer.Exit(1) from e
    try:
        transport_raw = repository.transports.read(transport_id)
    except FileNotFoundError as e:
        console.print(f"[bold red]Transport not found: {transport_id}[/bold red]")
        raise typer.Exit(1) from e
    driver = driver_dto_to_core(driver_raw)
    protocol = TransportProtocols(transport_raw["protocol"])
    assert protocol == driver.transport, "Driver and transport protocol mismatch"  # noqa: S101
    transport_client = transport_dto_to_core(transport_raw)
    asyncio.run(_run_discovery(driver, transport_client))  # ty:ignore[invalid-argument-type]

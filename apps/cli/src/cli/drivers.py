from typing import TYPE_CHECKING, Annotated

import typer
from core.devices_manager import DevicesManager
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
        console.print(driver["name"])


@app.command()
def discover(
    ctx: typer.Context,
    driver_id: str,
    transport_config: Annotated[
        str | None,
        typer.Option(
            "--transport-config",
            "-t",
            help="A transport config if required for the transport",
        ),
    ] = None,
) -> None:
    repository: CoreFileStorage = ctx.obj["repository"]
    transport_config_raw = None
    try:
        driver_raw = repository.drivers.read(driver_id)
        if transport_config:
            transport_config_raw = repository.transport_configs.read(transport_config)
    except FileNotFoundError as e:
        console.print(f"[bold red]Not found: {driver_id}[/bold red]")
        raise typer.Exit(1) from e
    driver = DevicesManager.build_driver(driver_raw, transport_config_raw)

    console.print(driver)

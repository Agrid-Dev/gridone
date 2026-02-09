from typing import TYPE_CHECKING

import typer
from rich.console import Console

from cli.repository import gridone_repository  # ty: ignore[unresolved-import]

if TYPE_CHECKING:
    from devices_manager.storage import CoreFileStorage

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

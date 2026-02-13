import asyncio

import typer
from devices_manager import DevicesManager
from rich.console import Console

from cli.config import get_database_url  # ty: ignore[unresolved-import]

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
    drivers = dm.list_drivers()
    for driver in drivers:
        console.print(driver.id)

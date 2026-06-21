import asyncio

import typer
from rich.console import Console

from cli.config import get_storage_url
from devices_manager import DevicesService

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


async def _make_service() -> DevicesService:
    svc = DevicesService(get_storage_url())
    await svc.start_readonly()
    return svc


@app.callback()
def _init(ctx: typer.Context) -> None:
    ctx.ensure_object(dict)
    ctx.obj.setdefault("dm", asyncio.run(_make_service()))


@app.command("list")
def list_all(ctx: typer.Context) -> None:
    dm: DevicesService = ctx.obj["dm"]
    drivers = dm.list_drivers()
    for driver in drivers:
        console.print(driver.id)

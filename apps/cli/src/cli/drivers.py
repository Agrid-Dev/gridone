import asyncio

import typer
from rich.console import Console

from cli.service import service

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.command("list")
def list_all() -> None:
    """List all drivers."""

    async def _run() -> None:
        async with service() as svc:
            for driver in svc.list_drivers():
                console.print(driver.id)

    asyncio.run(_run())

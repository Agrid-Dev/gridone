import typer
from rich.console import Console

from cli.service import run_async, service

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.command("list")
@run_async
async def list_all() -> None:
    """List all drivers."""
    async with service() as svc:
        for driver in svc.list_drivers():
            console.print(driver.id)

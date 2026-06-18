"""
CLI entrypoint for the gridone core.
"""

import logging

import typer
from rich.logging import RichHandler

from cli.devices import app as devices_app
from cli.drivers import app as drivers_app

# Configure logging with RichHandler
logging.basicConfig(
    level=logging.WARNING,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler()],
    force=True,
)
for _noisy in ("pymodbus", "mqtt", "aiomqtt"):
    logging.getLogger(_noisy).setLevel(logging.CRITICAL)


app = typer.Typer(pretty_exceptions_show_locals=False)
app.add_typer(devices_app, name="devices", help="Manage devices.")
app.add_typer(drivers_app, name="drivers", help="Manage drivers.")

if __name__ == "__main__":
    app()

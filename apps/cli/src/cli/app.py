"""
CLI entrypoint for the gridone core.
"""

import logging
import os

import typer
from rich.logging import RichHandler

from cli.devices import app as devices_app
from cli.drivers import app as drivers_app

# Configure logging with RichHandler. The level is overridable via the
# GRIDONE_LOG_LEVEL env var (e.g. GRIDONE_LOG_LEVEL=DEBUG) to surface
# transport-level diagnostics without a code change.
_log_level = os.environ.get("GRIDONE_LOG_LEVEL", "WARNING").upper()
logging.basicConfig(
    level=getattr(logging, _log_level, logging.WARNING),
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler()],
)


app = typer.Typer(pretty_exceptions_show_locals=False)
app.add_typer(devices_app, name="devices", help="Manage devices.")
app.add_typer(drivers_app, name="drivers", help="Manage drivers.")

if __name__ == "__main__":
    app()

"""
CLI entrypoint for the gridone core.
"""

import typer

from cli.devices import app as devices_app  # ty: ignore[unresolved-import]
from cli.drivers import app as drivers_app

app = typer.Typer(pretty_exceptions_show_locals=False)
app.add_typer(devices_app, name="devices", help="Manage devices.")
app.add_typer(drivers_app, name="drivers", help="Manage devices.")

if __name__ == "__main__":
    app()

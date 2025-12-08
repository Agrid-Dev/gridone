"""
CLI entrypoint for the gridone core.
"""

import devices  # ty: ignore[unresolved-import]
import typer

app = typer.Typer(pretty_exceptions_show_locals=False)
app.add_typer(devices.app, name="devices", help="Manage devices.")

if __name__ == "__main__":
    app()

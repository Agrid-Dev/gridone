"""
CLI entrypoint for the gridone app.

Typer command handlers are synchronous. Any async work is executed by
wrapping the async coroutine in `asyncio.run(...)` so Typer can call the
functions synchronously.
"""

import asyncio

import typer
from repository import gridone_repository  # ty: ignore[unresolved-import]

app = typer.Typer(pretty_exceptions_show_locals=False)


async def _read_device_async(device_id: str) -> None:
    """
    Async implementation that performs device manager initialization and
    reads attributes from the device using async drivers/transports.
    """
    device = gridone_repository.load_device(device_id)
    print(f"Reading device {device_id} with driver {device.driver.name}")
    # Use the async transport context manager inside the coroutine
    async with device.driver.transport:
        for attribute in device.attributes:
            value = await device.read_attribute_value(attribute)
            print(f"{attribute}: {value}")


@app.command()
def read_device(device_id: str) -> None:
    """
    Synchronous Typer command that runs the async device reader.
    """
    # Run the async coroutine in a fresh event loop and block until complete.
    asyncio.run(_read_device_async(device_id))


@app.command()
def goodbye(name: str, formal: bool = False) -> None:  # noqa: FBT001, FBT002
    """
    Simple synchronous command left as-is.
    """
    if formal:
        print(f"Goodbye Ms. {name}. Have a good day.")
    else:
        print(f"Bye {name}!")


if __name__ == "__main__":
    # Do NOT wrap `app()` with asyncio.run. Typer's `app()` is synchronous and
    # will parse CLI args and dispatch to the commands above.
    app()

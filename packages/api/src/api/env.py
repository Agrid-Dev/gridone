import os

from dotenv import dotenv_values, find_dotenv


def load_environ() -> dict[str, str | None]:
    """Read .env (if present) and overlay it with os.environ.

    Single source of truth for "what env vars did this process see?".
    ``find_dotenv(usecwd=True)`` locates the nearest ``.env`` by walking up
    from the current working directory, so each app picks up the ``.env``
    sitting next to it when launched from its own directory. The bare
    ``dotenv_values()`` default resolves relative to *this* source file
    instead of the cwd under a non-interactive launch (uvicorn), which
    never reaches an app's ``.env``. ``find_dotenv`` returns ``""`` when no
    file exists (the Docker case), so only ``os.environ`` is used. Process
    env wins when a key appears in both sources.
    """
    dotenv_path = find_dotenv(usecwd=True)
    file_values = dotenv_values(dotenv_path) if dotenv_path else {}
    return {**file_values, **os.environ}

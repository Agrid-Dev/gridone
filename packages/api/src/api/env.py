import os

from dotenv import dotenv_values


def load_environ() -> dict[str, str | None]:
    """Read .env (if present) and overlay it with os.environ.

    Single source of truth for "what env vars did this process see?".
    ``dotenv_values`` returns ``{}`` when no .env file is present (the
    Docker case), so the same code path serves both local-dev and the
    container. Process env wins when a key appears in both sources.
    """
    return {**dotenv_values(), **os.environ}

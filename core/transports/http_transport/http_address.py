from typing import Literal, cast

type HttpMethod = Literal["GET", "POST", "PUT", "DELETE", "PATCH"]
HTTP_METHODS: set[HttpMethod] = {
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
}


def parse_http_address(address: str) -> tuple[HttpMethod, str]:
    parts = address.strip().split()
    method = parts[0]
    if method not in HTTP_METHODS:
        msg = f"Invalid HTTP method {method}, allowed: {' ,'.join(HTTP_METHODS)}"
        raise ValueError(
            msg,
        )
    endpoint = parts[-1]
    return cast("HttpMethod", method), endpoint


def render_endpoint(endpoint: str, config: dict) -> str:
    """Renders templated endpoint eg {base_url}/?latitude={lattitude}&longitude={longitude}
    from dictionnary data"""
    for key, value in config.items():
        endpoint = endpoint.replace(f"{{{key}}}", str(value))
    return endpoint

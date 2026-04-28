import re

from models.errors import InvalidError

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_LINK_RE = re.compile(r"\[.*?\]\(([^)]*)\)")
_ALLOWED_SCHEMES = ("http://", "https://", "resource://")


def sanitize_body(body: str) -> str:
    """Validate a notification body.

    Allows plain text, bold (**...**), italic (*...*), and markdown links
    with http://, https://, or resource:// URIs. Raises InvalidError on
    raw HTML tags or disallowed link schemes.
    """
    if _HTML_TAG_RE.search(body):
        msg = "Notification body must not contain raw HTML"
        raise InvalidError(msg)
    for match in _LINK_RE.finditer(body):
        url = match.group(1)
        if not any(url.startswith(scheme) for scheme in _ALLOWED_SCHEMES):
            msg = f"Notification body contains a disallowed link scheme: {url!r}"
            raise InvalidError(msg)
    return body

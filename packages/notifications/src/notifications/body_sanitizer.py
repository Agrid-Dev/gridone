from markdown_it import MarkdownIt
from markdown_it.token import Token

from models.errors import InvalidError

_ALLOWED_TOKEN_TYPES = {
    "paragraph_open",
    "paragraph_close",
    "inline",
    "text",
    "softbreak",
    "hardbreak",
    "strong_open",
    "strong_close",
    "em_open",
    "em_close",
    "link_open",
    "link_close",
}
_ALLOWED_LINK_SCHEMES = ("http://", "https://", "resource://")

_md = MarkdownIt("commonmark")


def _flatten(tokens: list[Token]) -> list[Token]:
    """Yield all tokens including nested children."""
    result = []
    for token in tokens:
        result.append(token)
        if token.children:
            result.extend(_flatten(token.children))
    return result


def validate_body(body: str) -> None:
    """Validate a notification body against an AST allowlist.

    Permits plain text, bold (**...**), italic (*...*), and markdown links
    with http://, https://, or resource:// URIs. Raises InvalidError on any
    disallowed markdown element or link scheme.
    """
    for token in _flatten(_md.parse(body)):
        if token.type not in _ALLOWED_TOKEN_TYPES:
            msg = f"Disallowed markdown element: {token.type!r}"
            raise InvalidError(msg)
        if token.type == "link_open":
            href = str(token.attrGet("href") or "")
            if not any(href.startswith(scheme) for scheme in _ALLOWED_LINK_SCHEMES):
                msg = f"Disallowed link scheme in notification body: {href!r}"
                raise InvalidError(msg)

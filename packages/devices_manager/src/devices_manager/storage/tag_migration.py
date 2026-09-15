"""Read-only checks shared by legacy tag storage migrations."""

from collections.abc import Iterable

from models.tags import normalize_tag


def canonical_tag_rows(
    rows: Iterable[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    """Reject ambiguous spellings before converting any stored device tag.

    Distinct original key/value pairs must not collapse into one group, even
    when the pairs occur on different devices. Repeated identical pairs are safe.
    """
    canonical = []
    spellings: dict[tuple[str, str], tuple[str, str]] = {}
    for device_id, key, value in rows:
        try:
            normalized = (normalize_tag(key), normalize_tag(value))
        except ValueError as exc:
            msg = f"Invalid legacy tag on device {device_id!r}: {(key, value)!r}"
            raise ValueError(msg) from exc
        previous = spellings.setdefault(normalized, (key, value))
        if previous != (key, value):
            msg = (
                f"Tag normalization collision: {previous!r} and {(key, value)!r}. "
                "Rename explicitly before migrating."
            )
            raise ValueError(msg)
        canonical.append((device_id, *normalized))
    return canonical

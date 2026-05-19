from difflib import SequenceMatcher

_FUZZY_THRESHOLD = 0.7


def _string_token_matches(token: str, name_words: list[str]) -> bool:
    return any(
        SequenceMatcher(None, token, word).ratio() >= _FUZZY_THRESHOLD
        for word in name_words
    )


def fuzzy_match(query: str, name: str) -> bool:
    """Return True if all tokens of *query* match *name*.

    Numeric tokens require an exact whole-word match; string tokens use fuzzy
    matching (SequenceMatcher ratio >= 0.7) against individual name words.
    An empty or blank query always returns True.
    """
    if not query.strip():
        return True
    name_lower = name.lower()
    name_words = name_lower.split()
    for token in query.lower().split():
        if token.isdigit():
            if token not in name_words:
                return False
        elif not _string_token_matches(token, name_words):
            return False
    return True

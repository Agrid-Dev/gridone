import re
from difflib import SequenceMatcher

_FUZZY_THRESHOLD = 0.7

# Tokenize into runs of digits and runs of (Unicode) letters, so hyphenated or
# concatenated names tokenize sensibly:
#   "EM300-Fuite-Colonne6" -> ["em", "300", "fuite", "colonne", "6"]
#   "Chambres étage 5"      -> ["chambres", "étage", "5"]   (accents preserved)
# Splitting on whitespace alone left such names as one giant word, which broke
# both substring search ("fuite" matched nothing) and numeric search
# ("...Colonne-6" matched every Colonne).
_TOKEN_RE = re.compile(r"\d+|[^\W\d_]+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _string_token_matches(token: str, words: list[str]) -> bool:
    return any(
        token in word or SequenceMatcher(None, token, word).ratio() >= _FUZZY_THRESHOLD
        for word in words
    )


def fuzzy_match(query: str, name: str) -> bool:
    """Return True if every token of *query* matches *name*.

    Both strings are tokenized into runs of letters and runs of digits. Numeric
    tokens require an exact whole-number match (``"6"`` matches ``"Colonne6"``
    but not ``"Colonne16"``); string tokens match a name token by substring or
    fuzzy ratio (SequenceMatcher >= 0.7, for typo tolerance). All query tokens
    must match (AND). An empty or blank query returns True.
    """
    query_tokens = _tokenize(query)
    if not query_tokens:
        return True
    name_words = _tokenize(name)
    for token in query_tokens:
        if token.isdigit():
            if token not in name_words:
                return False
        elif not _string_token_matches(token, name_words):
            return False
    return True

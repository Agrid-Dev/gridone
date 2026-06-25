import pytest

from devices_manager.core.fuzzy_search import fuzzy_match


class TestFuzzyMatch:
    @pytest.mark.parametrize(
        ("query", "name", "expected"),
        [
            # exact match
            ("chambre 12", "chambre 12", True),
            # fuzzy string token matches despite typo
            ("chmabre 12", "chambre 12", True),
            # numeric token is whole-word: "13" does not match "chambre 12"
            ("chambre 13", "chambre 12", False),
            # numeric token is whole-word: "3" does not match "chambre 13"
            ("chambre 3", "chambre 13", False),
            # numeric token is whole-word: "1" does not match "chambre 12"
            ("1", "chambre 12", False),
            # AND semantics: all tokens must match — missing token rejects device
            ("chambre 12", "chambre", False),
            # empty query returns True
            ("", "chambre 12", True),
            # whitespace-only query returns True
            ("   ", "chambre 12", True),
            # --- hyphenated / concatenated names (leak detectors) ---
            # a substring of a concatenated name matches (was: matched nothing)
            ("fuite", "EM300-Fuite-Colonne6", True),
            ("colonne", "EM300-Fuite-Colonne6", True),
            ("colon", "EM300-Fuite-Colonne6", True),  # partial prefix
            # full hyphenated query targets exactly its number (was: matched all)
            ("EM300-Fuite-Colonne-6", "EM300-Fuite-Colonne6", True),
            ("EM300-Fuite-Colonne-6", "EM300-Fuite-Colonne16", False),
            ("EM300-Fuite-Colonne-6", "EM300-Fuite-Colonne1", False),
            # numeric token glued to letters is still whole-number
            ("colonne 6", "EM300-Fuite-Colonne16", False),
            ("colonne 16", "EM300-Fuite-Colonne16", True),
            # accented names tokenize without dropping the accent
            ("étage 5", "AUT_N6 — Chambres étage 5", True),
            ("étage 5", "AUT_N6 — Chambres étage 7", False),
        ],
    )
    def test_fuzzy_match(self, query: str, name: str, expected: bool) -> None:
        assert fuzzy_match(query, name) is expected

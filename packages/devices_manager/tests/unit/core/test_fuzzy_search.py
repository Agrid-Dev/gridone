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
        ],
    )
    def test_fuzzy_match(self, query: str, name: str, expected: bool) -> None:
        assert fuzzy_match(query, name) is expected

import pytest

from api.features import enabled_flags


class TestEnabledFlags:
    def test_empty_when_no_matching_env_vars(self):
        env = {"PATH": "/usr/bin", "GRIDONE_VERSION": "1.0.0"}
        assert enabled_flags(env) == []

    def test_strips_prefix_and_lowercases(self):
        env = {"GRIDONE_FEATURE_BUILDING_HOMEPAGE": "true"}
        assert enabled_flags(env) == ["building_homepage"]

    @pytest.mark.parametrize(
        "value",
        ["true", "TRUE", "True", "1", "yes", "YES", "on", "y", "t", " true "],
    )
    def test_truthy_values_enable_flag(self, value):
        env = {"GRIDONE_FEATURE_FOO": value}
        assert enabled_flags(env) == ["foo"]

    @pytest.mark.parametrize(
        "value",
        ["false", "FALSE", "0", "no", "off", "n", "f", "", "anything-else"],
    )
    def test_falsy_or_unknown_values_omit_flag(self, value):
        env = {"GRIDONE_FEATURE_FOO": value}
        assert enabled_flags(env) == []

    def test_multiple_flags_returned_sorted(self):
        env = {
            "GRIDONE_FEATURE_ZULU": "true",
            "GRIDONE_FEATURE_ALPHA": "true",
            "GRIDONE_FEATURE_MIKE": "false",
        }
        assert enabled_flags(env) == ["alpha", "zulu"]

    def test_ignores_env_vars_without_prefix(self):
        env = {
            "FEATURE_FOO": "true",
            "GRIDONE_FOO": "true",
            "GRIDONE_FEATURE_BAR": "true",
        }
        assert enabled_flags(env) == ["bar"]

    def test_prefix_match_is_case_insensitive(self):
        # Defensive — the actual sources (dotenv_values, os.environ) keep
        # the original case, but the matcher should not depend on that.
        env = {"gridone_feature_building_homepage": "true"}
        assert enabled_flags(env) == ["building_homepage"]

    def test_dedupes_when_same_flag_set_in_both_cases(self):
        env = {
            "gridone_feature_building_homepage": "true",
            "GRIDONE_FEATURE_BUILDING_HOMEPAGE": "true",
        }
        assert enabled_flags(env) == ["building_homepage"]

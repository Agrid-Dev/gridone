import pytest
from pydantic import ValidationError

from api.settings import Settings, load_settings


class TestExtraEnvIgnored:
    def test_ignores_unrelated_kwargs(self):
        Settings(GRIDONE_FEATURE_BUILDING_HOMEPAGE="true")  # ty: ignore[unknown-argument]


class TestTimezoneValidation:
    def test_default_is_utc(self):
        settings = Settings()
        assert settings.GRIDONE_TIMEZONE == "UTC"

    def test_valid_iana_timezone(self):
        settings = Settings(GRIDONE_TIMEZONE="Europe/Paris")
        assert settings.GRIDONE_TIMEZONE == "Europe/Paris"

    def test_invalid_timezone_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(GRIDONE_TIMEZONE="Not/ATimezone")
        assert "GRIDONE_TIMEZONE" in str(exc_info.value)
        assert "not a valid IANA timezone name" in str(exc_info.value)


class TestLoadSettings:
    def test_only_known_fields_are_forwarded(self):
        env = {
            "STORAGE_URL": "postgresql://example",
            "GRIDONE_FEATURE_BUILDING_HOMEPAGE": "true",
            "RANDOM_UNRELATED": "x",
        }
        settings = load_settings(env)
        assert settings.STORAGE_URL == "postgresql://example"

    def test_coerces_string_values_to_typed_fields(self):
        env = {"COOKIE_SECURE": "true", "ACCESS_TOKEN_EXPIRE_MINUTES": "60"}
        settings = load_settings(env)
        assert settings.COOKIE_SECURE is True
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 60

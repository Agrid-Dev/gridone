import pytest
from pydantic import ValidationError

from api.settings import Settings


class TestTimezoneValidation:
    def test_default_is_utc(self):
        settings = Settings(_env_file=None)  # ty: ignore[unknown-argument]
        assert settings.GRIDONE_TIMEZONE == "UTC"

    def test_valid_iana_timezone(self):
        settings = Settings(_env_file=None, GRIDONE_TIMEZONE="Europe/Paris")  # ty: ignore[unknown-argument]
        assert settings.GRIDONE_TIMEZONE == "Europe/Paris"

    def test_invalid_timezone_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            Settings(_env_file=None, GRIDONE_TIMEZONE="Not/ATimezone")  # ty: ignore[unknown-argument]
        assert "GRIDONE_TIMEZONE" in str(exc_info.value)
        assert "not a valid IANA timezone name" in str(exc_info.value)

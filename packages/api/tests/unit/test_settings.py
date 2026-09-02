import pytest
from pydantic import ValidationError

from api.settings import Settings, load_settings
from users.validation import PASSWORD_MAX_LENGTH


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


class TestCookieSecure:
    def test_secure_by_default(self):
        assert Settings().COOKIE_SECURE is True

    def test_can_opt_out_for_plain_http(self):
        assert load_settings({"COOKIE_SECURE": "false"}).COOKIE_SECURE is False


class TestAdminPassword:
    def test_unset_by_default(self):
        assert Settings().GRIDONE_ADMIN_PASSWORD is None

    def test_accepts_a_valid_password(self):
        seeded = "good-password"
        settings = load_settings({"GRIDONE_ADMIN_PASSWORD": seeded})
        assert seeded == settings.GRIDONE_ADMIN_PASSWORD

    @pytest.mark.parametrize(
        "value",
        [
            pytest.param("a" * (PASSWORD_MAX_LENGTH + 1), id="ascii-over-limit"),
            # 40 characters, 80 bytes once encoded.
            pytest.param("é" * 40, id="multibyte-over-limit"),
            pytest.param("ab", id="under-minimum"),
        ],
    )
    def test_rejects_a_password_bcrypt_could_not_hash(self, value: str):
        """Fails at settings load, not inside bcrypt during the lifespan."""
        with pytest.raises(ValidationError) as exc_info:
            load_settings({"GRIDONE_ADMIN_PASSWORD": value})
        assert "GRIDONE_ADMIN_PASSWORD" in str(exc_info.value)


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

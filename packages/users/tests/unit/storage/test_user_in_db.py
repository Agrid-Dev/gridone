from users.models import UserInDB


class TestUserInDBIsBlocked:
    def test_user_in_db_inherits_is_blocked(self):
        user = UserInDB(
            id="1",
            username="alice",
            hashed_password="hash",
            is_blocked=True,
        )
        assert user.is_blocked is True

    def test_backward_compat_missing_is_blocked_defaults_to_false(self):
        """Existing YAML files without is_blocked should default to False."""
        data = {
            "id": "1",
            "username": "legacy",
            "hashed_password": "hash",
            "role": "admin",
        }
        user = UserInDB.model_validate(data)
        assert user.is_blocked is False

from users.models import User, UserCreate, UserInDB, UserType


class TestUserType:
    def test_enum_values(self):
        assert UserType.USER == "user"
        assert UserType.SERVICE_ACCOUNT == "service_account"

    def test_user_default_type(self):
        user = User(id="1", username="alice")
        assert user.type == UserType.USER

    def test_user_explicit_service_account(self):
        user = User(id="1", username="bot", type=UserType.SERVICE_ACCOUNT)
        assert user.type == UserType.SERVICE_ACCOUNT

    def test_user_in_db_inherits_type(self):
        user = UserInDB(
            id="1",
            username="bot",
            hashed_password="hash",
            type=UserType.SERVICE_ACCOUNT,
        )
        assert user.type == UserType.SERVICE_ACCOUNT

    def test_user_create_default_type(self):
        create = UserCreate(username="alice", password="secret")
        assert create.type == UserType.USER

    def test_user_create_explicit_type(self):
        create = UserCreate(
            username="bot", password="secret", type=UserType.SERVICE_ACCOUNT
        )
        assert create.type == UserType.SERVICE_ACCOUNT

    def test_backward_compat_missing_type_defaults_to_user(self):
        """Existing YAML files without a type field should default to 'user'."""
        data = {
            "id": "1",
            "username": "legacy",
            "hashed_password": "hash",
            "role": "admin",
        }
        user = UserInDB.model_validate(data)
        assert user.type == UserType.USER


class TestIsBlocked:
    def test_default_is_not_blocked(self):
        user = User(id="1", username="alice")
        assert user.is_blocked is False

    def test_can_set_blocked(self):
        user = User(id="1", username="alice", is_blocked=True)
        assert user.is_blocked is True

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

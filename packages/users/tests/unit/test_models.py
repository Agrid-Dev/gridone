"""Tests for users.models."""

from users.models import User, UserCreate, UserInDB, UserUpdate
from users.password import verify_password


class TestUser:
    def test_defaults(self):
        user = User(id="u1", username="bob")
        assert user.name == ""
        assert user.email == ""
        assert user.title == ""
        assert user.must_change_password is False

    def test_all_fields(self):
        user = User(
            id="u1",
            username="bob",
            name="Bob",
            email="bob@example.com",
            title="Admin",
            must_change_password=True,
        )
        assert user.username == "bob"
        assert user.name == "Bob"
        assert user.must_change_password is True


class TestUserInDB:
    def test_inherits_user_fields(self):
        user = UserInDB(id="u1", username="bob", hashed_password="hash123")
        assert user.id == "u1"
        assert user.username == "bob"
        assert user.hashed_password == "hash123"

    def test_update_username(self):
        user = UserInDB(id="u1", username="old", hashed_password="hash")
        updated = user.update(UserUpdate(username="new"))
        assert updated.username == "new"
        assert updated.hashed_password == "hash"  # unchanged

    def test_update_password(self):
        user = UserInDB(
            id="u1",
            username="bob",
            hashed_password="oldhash",
            must_change_password=True,
        )
        updated = user.update(UserUpdate(password="newpassword"))
        assert verify_password("newpassword", updated.hashed_password)
        assert updated.must_change_password is False  # cleared on password change

    def test_update_preserves_unset_fields(self):
        user = UserInDB(
            id="u1",
            username="bob",
            hashed_password="hash",
            name="Bob",
            email="bob@example.com",
        )
        updated = user.update(UserUpdate(title="Engineer"))
        assert updated.name == "Bob"
        assert updated.email == "bob@example.com"
        assert updated.title == "Engineer"


class TestUserUpdate:
    def test_to_storage_update_dict_empty(self):
        update = UserUpdate()
        assert update.to_storage_update_dict() == {}

    def test_to_storage_update_dict_username(self):
        update = UserUpdate(username="newname")
        d = update.to_storage_update_dict()
        assert d == {"username": "newname"}

    def test_to_storage_update_dict_password_hashes_and_clears_flag(self):
        update = UserUpdate(password="secret123")
        d = update.to_storage_update_dict()
        assert "hashed_password" in d
        assert "password" not in d
        assert d["must_change_password"] is False
        assert verify_password("secret123", d["hashed_password"])

    def test_to_storage_update_dict_multiple_fields(self):
        update = UserUpdate(name="New Name", email="new@example.com", title="CTO")
        d = update.to_storage_update_dict()
        assert d == {"name": "New Name", "email": "new@example.com", "title": "CTO"}

    def test_to_storage_update_dict_must_change_password(self):
        update = UserUpdate(must_change_password=True)
        d = update.to_storage_update_dict()
        assert d == {"must_change_password": True}

    def test_password_overrides_must_change_password(self):
        update = UserUpdate(password="newpass", must_change_password=True)
        d = update.to_storage_update_dict()
        # password change takes precedence — clears the flag
        assert d["must_change_password"] is False


class TestUserCreate:
    def test_defaults(self):
        data = UserCreate(username="bob", password="secret")
        assert data.name == ""
        assert data.email == ""
        assert data.title == ""

    def test_all_fields(self):
        data = UserCreate(
            username="bob",
            password="secret",
            name="Bob",
            email="bob@example.com",
            title="Dev",
        )
        assert data.username == "bob"
        assert data.name == "Bob"

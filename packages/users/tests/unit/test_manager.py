"""Tests for users.manager.UsersManager."""

import pytest

from models.errors import NotFoundError

from users.manager import UsersManager
from users.models import User, UserCreate, UserInDB, UserUpdate
from users.password import hash_password, verify_password

from conftest import MemoryAuthorizationStorage, MemoryUsersStorage


@pytest.fixture
def manager(users_storage: MemoryUsersStorage) -> UsersManager:
    return UsersManager(users_storage)


@pytest.fixture
def manager_with_auth(
    users_storage: MemoryUsersStorage,
    auth_storage: MemoryAuthorizationStorage,
) -> UsersManager:
    return UsersManager(users_storage, authorization_storage=auth_storage)


class TestEnsureDefaultAdmin:
    @pytest.mark.asyncio
    async def test_creates_admin_when_no_users(self, manager: UsersManager):
        admin_id = await manager.ensure_default_admin()
        assert admin_id is not None
        user = await manager.get_by_username("admin")
        assert user is not None
        assert user.username == "admin"
        assert user.must_change_password is True

    @pytest.mark.asyncio
    async def test_admin_password_is_admin(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await manager.ensure_default_admin()
        user = await users_storage.get_by_username("admin")
        assert user is not None
        assert verify_password("admin", user.hashed_password)

    @pytest.mark.asyncio
    async def test_does_not_create_when_users_exist(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        existing = UserInDB(
            id="existing",
            username="someone",
            hashed_password=hash_password("pass"),
        )
        await users_storage.save(existing)
        result = await manager.ensure_default_admin()
        assert result is None


class TestGetByUsername:
    @pytest.mark.asyncio
    async def test_existing_user(
        self,
        manager: UsersManager,
        users_storage: MemoryUsersStorage,
        sample_user: UserInDB,
    ):
        await users_storage.save(sample_user)
        user = await manager.get_by_username("alice")
        assert user is not None
        assert user.username == "alice"
        assert isinstance(user, User)

    @pytest.mark.asyncio
    async def test_nonexistent_user(self, manager: UsersManager):
        user = await manager.get_by_username("nobody")
        assert user is None


class TestGetById:
    @pytest.mark.asyncio
    async def test_existing_user(
        self,
        manager: UsersManager,
        users_storage: MemoryUsersStorage,
        sample_user: UserInDB,
    ):
        await users_storage.save(sample_user)
        user = await manager.get_by_id("user-1")
        assert user.username == "alice"

    @pytest.mark.asyncio
    async def test_not_found(self, manager: UsersManager):
        with pytest.raises(NotFoundError):
            await manager.get_by_id("nonexistent")


class TestAuthenticate:
    @pytest.mark.asyncio
    async def test_correct_credentials(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        user = UserInDB(
            id="u1",
            username="bob",
            hashed_password=hash_password("correctpass"),
        )
        await users_storage.save(user)
        result = await manager.authenticate("bob", "correctpass")
        assert result is not None
        assert result.username == "bob"

    @pytest.mark.asyncio
    async def test_wrong_password(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        user = UserInDB(
            id="u1",
            username="bob",
            hashed_password=hash_password("correctpass"),
        )
        await users_storage.save(user)
        result = await manager.authenticate("bob", "wrongpass")
        assert result is None

    @pytest.mark.asyncio
    async def test_nonexistent_username(self, manager: UsersManager):
        result = await manager.authenticate("nobody", "pass")
        assert result is None


class TestListUsers:
    @pytest.mark.asyncio
    async def test_empty(self, manager: UsersManager):
        users = await manager.list_users()
        assert users == []

    @pytest.mark.asyncio
    async def test_returns_public_users(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        u1 = UserInDB(id="u1", username="a", hashed_password="h1")
        u2 = UserInDB(id="u2", username="b", hashed_password="h2")
        await users_storage.save(u1)
        await users_storage.save(u2)
        users = await manager.list_users()
        assert len(users) == 2
        assert all(isinstance(u, User) for u in users)
        # Public users should not expose hashed_password
        assert not hasattr(users[0], "hashed_password") or not isinstance(
            users[0], UserInDB
        )


class TestCreateUser:
    @pytest.mark.asyncio
    async def test_create_user(self, manager: UsersManager):
        user = await manager.create_user(
            UserCreate(username="newuser", password="password123")
        )
        assert user.username == "newuser"
        assert isinstance(user, User)
        assert user.must_change_password is False

    @pytest.mark.asyncio
    async def test_password_is_hashed(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await manager.create_user(
            UserCreate(username="newuser", password="password123")
        )
        stored = await users_storage.get_by_username("newuser")
        assert stored is not None
        assert verify_password("password123", stored.hashed_password)

    @pytest.mark.asyncio
    async def test_duplicate_username_raises(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await users_storage.save(
            UserInDB(id="u1", username="taken", hashed_password="hash")
        )
        with pytest.raises(ValueError, match="already exists"):
            await manager.create_user(
                UserCreate(username="taken", password="password123")
            )

    @pytest.mark.asyncio
    async def test_create_with_all_fields(self, manager: UsersManager):
        user = await manager.create_user(
            UserCreate(
                username="full",
                password="password123",
                name="Full Name",
                email="full@example.com",
                title="Manager",
            )
        )
        assert user.name == "Full Name"
        assert user.email == "full@example.com"
        assert user.title == "Manager"


class TestUpdateUser:
    @pytest.mark.asyncio
    async def test_update_username(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await users_storage.save(
            UserInDB(id="u1", username="old", hashed_password="hash")
        )
        updated = await manager.update_user("u1", UserUpdate(username="new"))
        assert updated.username == "new"

    @pytest.mark.asyncio
    async def test_update_password(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await users_storage.save(
            UserInDB(
                id="u1",
                username="bob",
                hashed_password=hash_password("old"),
                must_change_password=True,
            )
        )
        updated = await manager.update_user("u1", UserUpdate(password="newpass12"))
        assert updated.must_change_password is False
        stored = await users_storage.get_by_id("u1")
        assert verify_password("newpass12", stored.hashed_password)

    @pytest.mark.asyncio
    async def test_update_nonexistent_raises(self, manager: UsersManager):
        with pytest.raises(NotFoundError):
            await manager.update_user("nope", UserUpdate(name="x"))

    @pytest.mark.asyncio
    async def test_duplicate_username_raises(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await users_storage.save(
            UserInDB(id="u1", username="alice", hashed_password="h1")
        )
        await users_storage.save(
            UserInDB(id="u2", username="bob", hashed_password="h2")
        )
        with pytest.raises(ValueError, match="already exists"):
            await manager.update_user("u2", UserUpdate(username="alice"))

    @pytest.mark.asyncio
    async def test_same_username_allowed(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await users_storage.save(
            UserInDB(id="u1", username="alice", hashed_password="h1")
        )
        # Updating to same username should be fine
        updated = await manager.update_user("u1", UserUpdate(username="alice"))
        assert updated.username == "alice"


class TestDeleteUser:
    @pytest.mark.asyncio
    async def test_delete_existing(
        self, manager: UsersManager, users_storage: MemoryUsersStorage
    ):
        await users_storage.save(
            UserInDB(id="u1", username="bob", hashed_password="hash")
        )
        await manager.delete_user("u1")
        assert await users_storage.get_by_id("u1") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_raises(self, manager: UsersManager):
        with pytest.raises(NotFoundError):
            await manager.delete_user("nope")

    @pytest.mark.asyncio
    async def test_delete_cascades_to_assignments(
        self,
        manager_with_auth: UsersManager,
        users_storage: MemoryUsersStorage,
        auth_storage: MemoryAuthorizationStorage,
    ):
        from users.authorization_models import UserRoleAssignment

        await users_storage.save(
            UserInDB(id="u1", username="bob", hashed_password="hash")
        )
        await auth_storage.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="u1", role_id="r1", asset_id="asset-1"
            )
        )
        await manager_with_auth.delete_user("u1")
        assignments = await auth_storage.list_assignments_for_user("u1")
        assert assignments == []


class TestSetAuthorizationStorage:
    @pytest.mark.asyncio
    async def test_set_and_use(
        self,
        manager: UsersManager,
        users_storage: MemoryUsersStorage,
        auth_storage: MemoryAuthorizationStorage,
    ):
        from users.authorization_models import UserRoleAssignment

        manager.set_authorization_storage(auth_storage)
        await users_storage.save(
            UserInDB(id="u1", username="bob", hashed_password="hash")
        )
        await auth_storage.save_assignment(
            UserRoleAssignment(
                id="a1", user_id="u1", role_id="r1", asset_id="asset-1"
            )
        )
        await manager.delete_user("u1")
        assignments = await auth_storage.list_assignments_for_user("u1")
        assert assignments == []


class TestToPublicUser:
    def test_strips_hashed_password(self):
        db_user = UserInDB(
            id="u1",
            username="bob",
            hashed_password="secret_hash",
            name="Bob",
        )
        public = UsersManager._to_public_user(db_user)
        assert isinstance(public, User)
        assert not isinstance(public, UserInDB)
        assert public.username == "bob"
        assert public.name == "Bob"

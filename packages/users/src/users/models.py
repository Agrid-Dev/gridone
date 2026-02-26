from pydantic import BaseModel

from users.password import hash_password


class User(BaseModel):
    """Public user model (no password hash)."""

    id: str
    username: str
    name: str = ""
    email: str = ""
    title: str = ""
    must_change_password: bool = False


class UserInDB(User):
    """Internal user model including hashed password."""

    hashed_password: str

    def update(self, update_data: "UserUpdate") -> "UserInDB":
        update_dict = update_data.to_storage_update_dict()
        return self.model_copy(update=update_dict)


class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = None
    name: str | None = None
    email: str | None = None
    title: str | None = None
    must_change_password: bool | None = None

    def to_storage_update_dict(self) -> dict[str, str | bool]:
        update_dict: dict[str, str | bool] = {}
        if self.username is not None:
            update_dict["username"] = self.username
        if self.name is not None:
            update_dict["name"] = self.name
        if self.email is not None:
            update_dict["email"] = self.email
        if self.title is not None:
            update_dict["title"] = self.title
        if self.must_change_password is not None:
            update_dict["must_change_password"] = self.must_change_password
        if self.password is not None:
            update_dict["hashed_password"] = hash_password(self.password)
            # A successful password change clears the forced reset flag.
            update_dict["must_change_password"] = False
        return update_dict


class UserCreate(BaseModel):
    username: str
    password: str
    name: str = ""
    email: str = ""
    title: str = ""


__all__ = ["User", "UserCreate", "UserInDB", "UserUpdate"]

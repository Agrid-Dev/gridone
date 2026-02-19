from pydantic import BaseModel


class User(BaseModel):
    """Public user model (no password hash)."""

    id: str
    username: str
    is_admin: bool = False
    name: str = ""
    email: str = ""
    title: str = ""
    must_change_password: bool = False


class UserInDB(User):
    """Internal user model including hashed password."""

    hashed_password: str


__all__ = ["User", "UserInDB"]

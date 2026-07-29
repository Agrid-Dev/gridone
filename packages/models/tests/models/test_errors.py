from models.errors import (
    StorageConnectionError,
    StorageError,
    StorageNotInitializedError,
    UnauthorizedError,
    UnsupportedStorageError,
)


def test_subclasses_share_storage_error_base() -> None:
    assert issubclass(UnsupportedStorageError, StorageError)
    assert issubclass(StorageConnectionError, StorageError)
    assert issubclass(StorageNotInitializedError, StorageError)


def test_unsupported_storage_carries_message() -> None:
    err = UnsupportedStorageError("unknown scheme: foo://")
    assert str(err) == "unknown scheme: foo://"


def test_storage_connection_carries_message() -> None:
    err = StorageConnectionError("could not connect to db")
    assert str(err) == "could not connect to db"


def test_unauthorized_carries_message() -> None:
    err = UnauthorizedError("Invalid bearer token")
    assert str(err) == "Invalid bearer token"

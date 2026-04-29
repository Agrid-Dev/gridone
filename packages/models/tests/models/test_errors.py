from models.errors import StorageError


def test_storage_error_is_exception() -> None:
    assert issubclass(StorageError, Exception)


def test_storage_error_carries_message() -> None:
    err = StorageError("unsupported scheme: foo://")
    assert str(err) == "unsupported scheme: foo://"

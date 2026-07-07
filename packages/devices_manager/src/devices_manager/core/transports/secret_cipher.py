from cryptography.fernet import Fernet, InvalidToken

from models.errors import StorageConnectionError


class SecretCipher:
    """Symmetric encryption for transport-config secret fields at rest."""

    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode())
        except (ValueError, TypeError) as e:
            msg = "Invalid transport secret encryption key"
            raise StorageConnectionError(msg) from e

    @staticmethod
    def generate_key() -> str:
        return Fernet.generate_key().decode()

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as e:
            msg = "Unable to decrypt transport secret: wrong key or corrupted data"
            raise StorageConnectionError(msg) from e

import pytest

from devices_manager.core.transports.secret_cipher import SecretCipher
from models.errors import StorageConnectionError


class TestSecretCipher:
    def test_round_trip(self) -> None:
        cipher = SecretCipher(SecretCipher.generate_key())
        ciphertext = cipher.encrypt("super-secret")
        assert ciphertext != "super-secret"
        assert cipher.decrypt(ciphertext) == "super-secret"

    def test_decrypt_with_wrong_key_raises(self) -> None:
        ciphertext = SecretCipher(SecretCipher.generate_key()).encrypt("value")
        other_cipher = SecretCipher(SecretCipher.generate_key())
        with pytest.raises(StorageConnectionError):
            other_cipher.decrypt(ciphertext)

    def test_invalid_key_raises(self) -> None:
        with pytest.raises(StorageConnectionError):
            SecretCipher("not-a-valid-fernet-key")

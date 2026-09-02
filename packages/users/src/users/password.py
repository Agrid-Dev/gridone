import bcrypt

BCRYPT_MAX_BYTES = 72


def exceeds_bcrypt_limit(plain: str) -> bool:
    """bcrypt raises above its byte limit rather than truncating."""
    return len(plain.encode()) > BCRYPT_MAX_BYTES


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Check a password. Input bcrypt cannot hash never matches."""
    encoded = plain.encode()
    if len(encoded) > BCRYPT_MAX_BYTES:
        return False
    return bcrypt.checkpw(encoded, hashed.encode())


__all__ = [
    "BCRYPT_MAX_BYTES",
    "exceeds_bcrypt_limit",
    "hash_password",
    "verify_password",
]

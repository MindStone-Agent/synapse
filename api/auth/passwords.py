"""Argon2 password hashing — humans only.

argon2-cffi handles salting + verification. Default parameters are
tuned for interactive auth (~50ms per verify on modern hardware).
"""

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    return True


def needs_rehash(password_hash: str) -> bool:
    """True if the existing hash uses old parameters and should be re-hashed
    on next successful verify. Caller stores the new hash."""
    return _hasher.check_needs_rehash(password_hash)

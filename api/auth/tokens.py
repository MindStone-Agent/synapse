"""Bearer-token + session-token utilities.

Tokens are opaque base64url strings (256 bits of entropy). At rest we
store sha256(token); the raw value is shown to the user once at
issuance and never again. Session tokens for humans use the same
shape.
"""

import hashlib
import secrets

TOKEN_BYTES = 32  # 256-bit


def generate_token() -> str:
    """Return a fresh opaque token. Show this to the user once at issuance."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def sha256_hash(token: str) -> str:
    """Stable hex digest of a token. Used as the at-rest representation."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

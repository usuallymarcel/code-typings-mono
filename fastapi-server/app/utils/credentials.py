import hashlib
import os
import hmac

ITERATIONS = 310_000
HASH_NAME = 'sha256'

def hash_password(password: str) -> tuple[str, str, int]:
    salt = os.urandom(16)

    pwd_hash = hashlib.pbkdf2_hmac(
        HASH_NAME,
        password.encode('utf-8'),
        salt,
        ITERATIONS
    )

    return (pwd_hash.hex(), salt.hex(), ITERATIONS)

def check_password(
        password: str,
        stored_hash: str,
        stored_salt: str,
        stored_iterations: int,
) -> bool:
    
    salt = bytes.fromhex(stored_salt)

    pwd_hash = hashlib.pbkdf2_hmac(
        HASH_NAME,
        password.encode('utf-8'),
        salt,
        stored_iterations
    )

    return hmac.compare_digest(pwd_hash.hex(), stored_hash)
import hashlib
import hmac
import os
import re
import sqlite3

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


# Hash password with a random salt using SHA-256
def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    if "$" not in (stored_hash or ""):
        return False
    salt, expected_digest = stored_hash.split("$", 1)
    actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100_000).hex()
    return hmac.compare_digest(actual_digest, expected_digest)


# Create the users table on first run
def init_auth_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = _get_connection(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


# Register a new user after checking name, email, and password length
def create_user(db_path: str, name: str, email: str, password: str) -> tuple[bool, dict | str]:
    clean_name = (name or "").strip()
    clean_email = (email or "").strip().lower()
    raw_password = password or ""

    if len(clean_name) < 2:
        return False, "Please enter your full name (at least 2 characters)."
    if not EMAIL_REGEX.match(clean_email):
        return False, "Please enter a valid email address."
    if len(raw_password) < 6:
        return False, "Password must be at least 6 characters long."

    password_hash = hash_password(raw_password)
    conn = _get_connection(db_path)
    try:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (clean_name, clean_email, password_hash),
        )
        conn.commit()
        return True, {
            "id": cursor.lastrowid,
            "name": clean_name,
            "email": clean_email,
            "is_guest": False,
        }
    except sqlite3.IntegrityError:
        return False, "An account with this email already exists. Please sign in instead."
    finally:
        conn.close()


# Check email and password against the database
def authenticate_user(db_path: str, email: str, password: str) -> tuple[bool, dict | str]:
    clean_email = (email or "").strip().lower()
    raw_password = password or ""

    if not clean_email or not raw_password:
        return False, "Please enter both your email and password."

    conn = _get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (clean_email,),
        ).fetchone()
    finally:
        conn.close()

    if not row or not verify_password(raw_password, row["password_hash"]):
        return False, "Invalid email or password. Please check your credentials or sign up."

    return True, {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "is_guest": False,
    }

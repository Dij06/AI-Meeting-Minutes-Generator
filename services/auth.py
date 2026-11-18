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
                supabase_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        try:
            conn.execute("ALTER TABLE users ADD COLUMN supabase_id TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()
    finally:
        conn.close()


def sync_supabase_user(db_path: str, email: str, name: str, supabase_id: str = None) -> dict:
    """Ensures a Supabase authenticated user exists in SQLite and returns clean profile dictionary."""
    clean_email = (email or "").strip().lower()
    clean_name = (name or "").strip() or clean_email.split("@")[0]
    conn = _get_connection(db_path)
    try:
        cur = conn.execute("SELECT id, name, email, supabase_id FROM users WHERE email = ?", (clean_email,))
        row = cur.fetchone()
        if row:
            if supabase_id and not row["supabase_id"]:
                conn.execute("UPDATE users SET supabase_id = ? WHERE id = ?", (supabase_id, row["id"]))
                conn.commit()
            return {
                "id": row["id"],
                "name": row["name"],
                "email": row["email"],
                "supabase_id": supabase_id or row["supabase_id"],
                "is_guest": False
            }
        else:
            cur = conn.execute(
                "INSERT INTO users (name, email, password_hash, supabase_id) VALUES (?, ?, ?, ?)",
                (clean_name, clean_email, "supabase_managed", supabase_id)
            )
            conn.commit()
            return {
                "id": cur.lastrowid,
                "name": clean_name,
                "email": clean_email,
                "supabase_id": supabase_id,
                "is_guest": False
            }
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


def update_user_password(db_path: str, email: str, current_password: str, new_password: str) -> tuple[bool, str]:
    clean_email = (email or "").strip().lower()
    raw_current = current_password or ""
    raw_new = new_password or ""

    if not clean_email:
        return False, "User session not found."
    if not raw_current:
        return False, "Please enter your current password."
    if len(raw_new) < 6:
        return False, "New password must be at least 6 characters long."

    conn = _get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE email = ?",
            (clean_email,),
        ).fetchone()

        if not row:
            return False, "User account not found."
        if not verify_password(raw_current, row["password_hash"]):
            return False, "Current password is incorrect."

        new_hash = hash_password(raw_new)
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE email = ?",
            (new_hash, clean_email),
        )
        conn.commit()
        return True, "Password updated successfully."
    finally:
        conn.close()


def update_user_profile(db_path: str, current_email: str, new_name: str, new_email: str) -> tuple[bool, dict | str]:
    old_email = (current_email or "").strip().lower()
    clean_name = (new_name or "").strip()
    clean_email = (new_email or old_email).strip().lower()

    if not old_email:
        return False, "Active user session not found."
    if len(clean_name) < 2:
        return False, "Name must be at least 2 characters long."
    if not EMAIL_REGEX.match(clean_email):
        return False, "Please provide a valid email address."

    conn = _get_connection(db_path)
    try:
        # Check if new email is already taken by another user
        if clean_email != old_email:
            existing = conn.execute(
                "SELECT id FROM users WHERE email = ?",
                (clean_email,),
            ).fetchone()
            if existing:
                return False, "An account with this new email already exists."

        conn.execute(
            "UPDATE users SET name = ?, email = ? WHERE email = ?",
            (clean_name, clean_email, old_email),
        )
        # Migrate any user meetings to the updated email address if table exists
        if clean_email != old_email:
            try:
                conn.execute(
                    "UPDATE meetings SET user_email = ? WHERE user_email = ?",
                    (clean_email, old_email),
                )
            except sqlite3.OperationalError:
                pass
        conn.commit()

        return True, {
            "name": clean_name,
            "email": clean_email,
            "is_guest": False,
        }
    except Exception as exc:
        return False, f"Failed to update profile: {str(exc)}"
    finally:
        conn.close()


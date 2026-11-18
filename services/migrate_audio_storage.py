"""
Migration Script: Local Audio Files (uploads/) -> Supabase Storage
"""
import os
import sys
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.supabase_storage import upload_audio_to_supabase, is_storage_bucket_ready
from services.supabase_db import SUPABASE_URL, _get_headers

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "instance", "meetly.db")


def run_audio_migration():
    if not is_storage_bucket_ready():
        print("[Storage Migration] Error: 'audio-recordings' bucket is not created or accessible yet.")
        print("Please run the SQL script in your Supabase SQL Editor first.")
        return False

    if not os.path.exists(UPLOADS_DIR):
        print("[Storage Migration] uploads/ directory not found.")
        return False

    files = [f for f in os.listdir(UPLOADS_DIR) if f != ".gitkeep" and os.path.isfile(os.path.join(UPLOADS_DIR, f))]
    print(f"[Storage Migration] Found {len(files)} files to migrate to Supabase Storage.")

    uploaded = 0
    mapping = {}

    for f in files:
        full_path = os.path.join(UPLOADS_DIR, f)
        sz_mb = os.path.getsize(full_path) / (1024 * 1024)
        print(f"  Uploading {f} ({sz_mb:.2f} MB)...", end=" ", flush=True)

        res = upload_audio_to_supabase(full_path, user_folder="guest", custom_filename=f)
        if res:
            uploaded += 1
            mapping[f] = res
            print(f"DONE -> {res['storage_path']}")
        else:
            print("FAILED")

    print(f"\n[Storage Migration] Successfully uploaded {uploaded} of {len(files)} files to Supabase Cloud Storage!")
    return True


if __name__ == "__main__":
    run_audio_migration()

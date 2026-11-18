"""
Migration Script: Local SQLite -> Supabase Cloud PostgreSQL
"""
import json
import sqlite3
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.supabase_db import save_meeting_supabase, is_supabase_table_ready

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "instance", "meetly.db")

def run_migration():
    if not is_supabase_table_ready():
        print("[Migration] Supabase table is not accessible yet.")
        return

    if not os.path.exists(DB_PATH):
        print("[Migration] No local SQLite database found.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM meetings").fetchall()

    migrated = 0
    for r in rows:
        meeting_data = {
            "title": r["title"],
            "filename": r["filename"],
            "file_size": r["file_size"],
            "statistics": {
                "duration": r["duration"],
                "word_count": r["word_count"],
                "language": r["language"]
            },
            "summary": r["summary"],
            "discussion_points": json.loads(r["discussion_points_json"] or "[]"),
            "decisions": json.loads(r["decisions_json"] or "[]"),
            "action_items": json.loads(r["action_items_json"] or "[]"),
            "utterances": json.loads(r["utterances_json"] or "[]"),
            "transcript": r["transcript"],
            "tags": json.loads(r["tags_json"] or '["Project"]'),
            "pinned": bool(r["pinned"])
        }
        res = save_meeting_supabase(meeting_data, r["user_email"], r["user_id"])
        if res:
            migrated += 1

    print(f"[Migration] Successfully synced {migrated} of {len(rows)} meetings to Supabase PostgreSQL!")
    conn.close()

if __name__ == "__main__":
    run_migration()

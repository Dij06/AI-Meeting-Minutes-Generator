import json
import os
import sqlite3
from datetime import datetime, timedelta

try:
    from services.supabase_db import (
        is_supabase_table_ready,
        save_meeting_supabase,
        get_user_meetings_supabase,
        update_meeting_supabase,
        delete_meeting_supabase,
        supabase_row_to_meeting,
    )
except ImportError:
    is_supabase_table_ready = lambda: False
    save_meeting_supabase = lambda *args, **kwargs: None
    get_user_meetings_supabase = lambda *args, **kwargs: None
    update_meeting_supabase = lambda *args, **kwargs: False
    delete_meeting_supabase = lambda *args, **kwargs: False
    supabase_row_to_meeting = lambda row: row

try:
    from services.supabase_storage import delete_audio_from_supabase
except ImportError:
    delete_audio_from_supabase = lambda *args, **kwargs: False


def _get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


# Create the meetings table if it does not exist yet
def init_meetings_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = _get_connection(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_email TEXT NOT NULL,
                user_id TEXT,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_size TEXT,
                duration TEXT,
                language TEXT,
                word_count INTEGER DEFAULT 0,
                summary TEXT,
                discussion_points_json TEXT DEFAULT '[]',
                decisions_json TEXT DEFAULT '[]',
                action_items_json TEXT DEFAULT '[]',
                utterances_json TEXT DEFAULT '[]',
                transcript TEXT DEFAULT '',
                tags_json TEXT DEFAULT '["Project"]',
                pinned INTEGER DEFAULT 0,
                storage_path TEXT,
                storage_url TEXT,
                local_path TEXT,
                deleted_at TEXT,
                delete_scheduled_for TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        for col, col_type in [
            ("user_id", "TEXT"),
            ("storage_path", "TEXT"),
            ("storage_url", "TEXT"),
            ("local_path", "TEXT"),
            ("deleted_at", "TEXT"),
            ("delete_scheduled_for", "TEXT"),
        ]:
            try:
                conn.execute(f"ALTER TABLE meetings ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass
        conn.commit()
    finally:
        conn.close()


def _clean_title(filename: str) -> str:
    name = (filename or "New Meeting").rsplit(".", 1)[0]
    parts = name.split("_", 1)
    if len(parts) == 2 and parts[0].isdigit():
        name = parts[1]
    return name.replace("_", " ").strip() or "New Meeting"


def _row_to_meeting(row: sqlite3.Row) -> dict:
    action_items = json.loads(row["action_items_json"] or "[]")
    decisions = json.loads(row["decisions_json"] or "[]")
    discussion_points = json.loads(row["discussion_points_json"] or "[]")
    utterances = json.loads(row["utterances_json"] or "[]")
    tags = json.loads(row["tags_json"] or '["Project"]')

    completed = sum(1 for a in action_items if str(a.get("status", "")).lower() == "completed")
    pending = sum(1 for a in action_items if str(a.get("status", "")).lower() == "pending")
    open_count = max(0, len(action_items) - completed - pending)

    created_dt = datetime.fromisoformat(row["created_at"])
    today_dt = datetime.now()
    day_diff = (today_dt.date() - created_dt.date()).days
    if day_diff == 0:
        date_label = "Today"
    elif day_diff == 1:
        date_label = "Yesterday"
    else:
        date_label = created_dt.strftime("%d %b")

    dur_text = row["duration"] or "0m"
    dur_mins = 0
    for part in dur_text.split():
        if part.endswith("h") and part[:-1].isdigit():
            dur_mins += int(part[:-1]) * 60
        elif part.endswith("m") and part[:-1].isdigit():
            dur_mins += int(part[:-1])

    return {
        "id": f"db-{row['id']}",
        "db_id": row["id"],
        "title": row["title"],
        "filename": row["filename"],
        "date": date_label,
        "fullDate": created_dt.strftime("%d %B %Y"),
        "dayOfWeek": created_dt.strftime("%a"),
        "duration": row["duration"] or "N/A",
        "durationMinutes": dur_mins,
        "audioSize": f"Audio: {row['file_size'] or 'N/A'}",
        "tags": tags,
        "pinned": bool(row["pinned"]),
        "actionsCount": len(action_items),
        "actionsBreakdown": {
            "open": open_count,
            "completed": completed,
            "pending": pending,
        },
        "decisionsCount": len(decisions),
        "category": "today" if day_diff == 0 else ("week" if day_diff <= 7 else "month"),
        "description": (row["summary"] or "")[:95],
        "summary": row["summary"] or "",
        "discussion_points": discussion_points,
        "decisions": decisions,
        "action_items": action_items,
        "utterances": utterances,
        "transcript": row["transcript"] or "",
        "storage_path": row["storage_path"] if "storage_path" in row.keys() else None,
        "storage_url": row["storage_url"] if "storage_url" in row.keys() else None,
        "local_path": row["local_path"] if "local_path" in row.keys() else None,
        "deleted_at": row["deleted_at"] if "deleted_at" in row.keys() else None,
        "delete_scheduled_for": row["delete_scheduled_for"] if "delete_scheduled_for" in row.keys() else None,
        "statistics": {
            "duration": row["duration"] or "N/A",
            "word_count": row["word_count"] or 0,
            "decisions_count": len(decisions),
            "action_items_count": len(action_items),
            "language": row["language"] or "English",
        },
    }


def save_meeting(db_path: str, user_email: str, meeting_data: dict) -> int:
    stats = meeting_data.get("statistics", {})
    filename = meeting_data.get("filename", "Meeting.mp3")
    title = meeting_data.get("title") or _clean_title(filename)
    created_at = datetime.now().isoformat(timespec="seconds")

    conn = _get_connection(db_path)
    try:
        cursor = conn.execute(
            """
            INSERT INTO meetings (
                user_email, user_id, title, filename, file_size, duration, language, word_count,
                summary, discussion_points_json, decisions_json, action_items_json,
                utterances_json, transcript, tags_json, pinned, storage_path, storage_url, local_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (user_email or "guest@meetly.app").lower(),
                meeting_data.get("user_id") or meeting_data.get("supabase_id"),
                title,
                filename,
                meeting_data.get("file_size", "N/A"),
                stats.get("duration", "N/A"),
                stats.get("language", "English"),
                int(stats.get("word_count", 0) or 0),
                meeting_data.get("summary", ""),
                json.dumps(meeting_data.get("discussion_points", [])),
                json.dumps(meeting_data.get("decisions", [])),
                json.dumps(meeting_data.get("action_items", [])),
                json.dumps(meeting_data.get("utterances", [])),
                meeting_data.get("transcript", ""),
                json.dumps(meeting_data.get("tags", ["Project"])),
                1 if meeting_data.get("pinned") else 0,
                meeting_data.get("storage_path"),
                meeting_data.get("storage_url"),
                meeting_data.get("local_path"),
                created_at,
            ),
        )
        conn.commit()
        last_id = cursor.lastrowid

        # Real-time Cloud Synchronization with Supabase PostgreSQL (if table exists)
        try:
            if is_supabase_table_ready():
                save_meeting_supabase(
                    meeting_data,
                    user_email,
                    user_id=meeting_data.get("user_id") or meeting_data.get("supabase_id"),
                    access_token=meeting_data.get("access_token"),
                )
        except Exception as e:
            print(f"[Supabase Sync] Warning on save: {e}")

        return last_id
    finally:
        conn.close()


def get_user_meetings(db_path: str, user_email: str) -> list[dict]:
    clean_email = (user_email or "guest@meetly.app").lower()
    # 1. Check Supabase PostgreSQL first if online and table is ready
    try:
        if is_supabase_table_ready() and not os.environ.get("MEETLY_TESTING"):
            supa_meetings = get_user_meetings_supabase(clean_email)
            if supa_meetings and len(supa_meetings) > 0:
                return [supabase_row_to_meeting(r) for r in supa_meetings]
    except Exception as e:
        print(f"[Supabase Sync] Warning on fetch: {e}")

    # 2. Seamless local SQLite fallback (strictly filtered by user email)
    conn = _get_connection(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM meetings WHERE user_email = ? AND (deleted_at IS NULL OR deleted_at = '') ORDER BY pinned DESC, id DESC",
            (clean_email,),
        ).fetchall()
        return [_row_to_meeting(row) for row in rows]
    finally:
        conn.close()


def get_meeting_by_id(db_path: str, user_email: str, meeting_id: int) -> dict | None:
    conn = _get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM meetings WHERE id = ? AND user_email = ? AND (deleted_at IS NULL OR deleted_at = '')",
            (meeting_id, (user_email or "guest@meetly.app").lower()),
        ).fetchone()
        return _row_to_meeting(row) if row else None
    finally:
        conn.close()


def update_meeting(db_path: str, user_email: str, meeting_id: int, updates: dict) -> bool:
    fields = []
    values = []

    if "title" in updates and str(updates["title"]).strip():
        fields.append("title = ?")
        values.append(str(updates["title"]).strip())
    if "pinned" in updates:
        fields.append("pinned = ?")
        values.append(1 if updates["pinned"] else 0)
    if "tags" in updates and isinstance(updates["tags"], list):
        fields.append("tags_json = ?")
        values.append(json.dumps(updates["tags"]))
    if "action_items" in updates and isinstance(updates["action_items"], list):
        fields.append("action_items_json = ?")
        values.append(json.dumps(updates["action_items"]))

    if not fields:
        return False

    values.extend([meeting_id, (user_email or "guest@meetly.app").lower()])
    conn = _get_connection(db_path)
    try:
        cursor = conn.execute(
            f"UPDATE meetings SET {', '.join(fields)} WHERE id = ? AND user_email = ?",
            values,
        )
        conn.commit()
        success = cursor.rowcount > 0
        if success:
            try:
                if is_supabase_table_ready():
                    update_meeting_supabase(meeting_id, updates, user_email)
            except Exception as e:
                print(f"[Supabase Sync] Warning on update: {e}")
        return success
    finally:
        conn.close()


def delete_meeting(db_path: str, user_email: str, meeting_id: int, immediate: bool = False, upload_folder: str = None) -> dict:
    clean_email = (user_email or "guest@meetly.app").lower()
    conn = _get_connection(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM meetings WHERE id = ? AND user_email = ?",
            (meeting_id, clean_email)
        ).fetchone()
        if not row:
            return {"success": False, "error": "Meeting not found"}

        if immediate:
            # Immediate permanent purge
            storage_path = row["storage_path"] if "storage_path" in row.keys() else None
            local_path = row["local_path"] if "local_path" in row.keys() else None
            filename = row["filename"] if "filename" in row.keys() else None

            # 1. Supabase Storage purge
            if storage_path:
                try:
                    delete_audio_from_supabase(storage_path)
                except Exception as e:
                    print(f"[Supabase Storage] Delete failed: {e}")

            # 2. Supabase DB purge
            try:
                if is_supabase_table_ready():
                    delete_meeting_supabase(meeting_id, clean_email)
            except Exception as e:
                print(f"[Supabase DB] Delete failed: {e}")

            # 3. Local disk purge
            if local_path and os.path.exists(local_path):
                try:
                    os.remove(local_path)
                except Exception:
                    pass
            elif upload_folder and filename:
                candidate = os.path.join(upload_folder, filename)
                if os.path.exists(candidate):
                    try:
                        os.remove(candidate)
                    except Exception:
                        pass

            # 4. SQLite purge
            cursor = conn.execute("DELETE FROM meetings WHERE id = ? AND user_email = ?", (meeting_id, clean_email))
            conn.commit()
            return {"success": True, "purged": True, "message": "Meeting permanently deleted."}

        else:
            # 7-day retention policy: schedule permanent purge after 7 days
            now_dt = datetime.utcnow()
            deleted_at = now_dt.isoformat()
            delete_scheduled_for = (now_dt + timedelta(days=7)).isoformat()

            cursor = conn.execute(
                "UPDATE meetings SET deleted_at = ?, delete_scheduled_for = ? WHERE id = ? AND user_email = ?",
                (deleted_at, delete_scheduled_for, meeting_id, clean_email)
            )
            conn.commit()

            # Sync soft deletion to Supabase DB if ready
            try:
                if is_supabase_table_ready():
                    update_meeting_supabase(meeting_id, {
                        "deleted_at": deleted_at,
                        "delete_scheduled_for": delete_scheduled_for
                    }, clean_email)
            except Exception as e:
                print(f"[Supabase Sync] Warning on soft delete: {e}")

            return {
                "success": True,
                "soft_deleted": True,
                "deleted_at": deleted_at,
                "delete_scheduled_for": delete_scheduled_for,
                "retention_days": 7,
                "message": "Recording scheduled for permanent deletion from Supabase and storage in 7 days."
            }
    finally:
        conn.close()


def purge_expired_meetings(db_path: str, upload_folder: str = None, retention_days: int = 7) -> int:
    """
    Permanently deletes all meetings whose deleted_at timestamp is older than retention_days (7 days).
    Purges:
    1. Audio recording file from Supabase Storage (delete_audio_from_supabase)
    2. Record from Supabase PostgreSQL (delete_meeting_supabase)
    3. Local recording file from disk (uploads/ folder)
    4. Record from local SQLite database
    """
    if not os.path.exists(db_path):
        return 0

    conn = _get_connection(db_path)
    purged_count = 0
    try:
        try:
            rows = conn.execute(
                "SELECT * FROM meetings WHERE deleted_at IS NOT NULL AND deleted_at != ''"
            ).fetchall()
        except sqlite3.OperationalError:
            return 0

        now_dt = datetime.utcnow()
        cutoff_dt = now_dt - timedelta(days=retention_days)

        for row in rows:
            del_str = row["deleted_at"]
            try:
                del_dt = datetime.fromisoformat(del_str)
            except Exception:
                continue

            if del_dt <= cutoff_dt:
                meeting_id = row["id"]
                user_email = row["user_email"]
                storage_path = row["storage_path"] if "storage_path" in row.keys() else None
                local_path = row["local_path"] if "local_path" in row.keys() else None
                filename = row["filename"] if "filename" in row.keys() else None

                # 1. Supabase Storage purge
                if storage_path:
                    try:
                        delete_audio_from_supabase(storage_path)
                    except Exception as e:
                        print(f"[Purge] Supabase Storage delete failed for {storage_path}: {e}")

                # 2. Supabase DB purge
                try:
                    if is_supabase_table_ready():
                        delete_meeting_supabase(meeting_id, user_email)
                except Exception as e:
                    print(f"[Purge] Supabase DB delete failed for meeting {meeting_id}: {e}")

                # 3. Local disk purge
                if local_path and os.path.exists(local_path):
                    try:
                        os.remove(local_path)
                    except Exception:
                        pass
                elif upload_folder and filename:
                    candidate = os.path.join(upload_folder, filename)
                    if os.path.exists(candidate):
                        try:
                            os.remove(candidate)
                        except Exception:
                            pass

                # 4. SQLite DB purge
                conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
                purged_count += 1

        if purged_count > 0:
            conn.commit()
            print(f"[Retention Policy] Successfully purged {purged_count} meeting(s) past {retention_days}-day retention.")
        return purged_count
    finally:
        conn.close()


def get_analytics_summary(db_path: str, user_email: str) -> dict:
    meetings = get_user_meetings(db_path, user_email)
    day_counts = {"Mon": 0, "Tue": 0, "Wed": 0, "Thu": 0, "Fri": 0}
    open_total = 0
    completed_total = 0
    pending_total = 0

    for m in meetings:
        day = m.get("dayOfWeek")
        if day in day_counts:
            day_counts[day] += 1
        bd = m.get("actionsBreakdown", {})
        open_total += bd.get("open", 0)
        completed_total += bd.get("completed", 0)
        pending_total += bd.get("pending", 0)

    return {
        "total_meetings": len(meetings),
        "activity": [{"day": d, "meetings": day_counts[d]} for d in ["Mon", "Tue", "Wed", "Thu", "Fri"]],
        "action_items": {
            "open": open_total,
            "completed": completed_total,
            "pending": pending_total,
        },
    }

import json
import os
import sqlite3
from datetime import datetime


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
                created_at TEXT NOT NULL
            )
            """
        )
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
                user_email, title, filename, file_size, duration, language, word_count,
                summary, discussion_points_json, decisions_json, action_items_json,
                utterances_json, transcript, tags_json, pinned, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                (user_email or "guest@meetly.app").lower(),
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
                created_at,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_user_meetings(db_path: str, user_email: str) -> list[dict]:
    conn = _get_connection(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM meetings WHERE user_email = ? ORDER BY pinned DESC, id DESC",
            ((user_email or "guest@meetly.app").lower(),),
        ).fetchall()
        return [_row_to_meeting(row) for row in rows]
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
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_meeting(db_path: str, user_email: str, meeting_id: int) -> bool:
    conn = _get_connection(db_path)
    try:
        cursor = conn.execute(
            "DELETE FROM meetings WHERE id = ? AND user_email = ?",
            (meeting_id, (user_email or "guest@meetly.app").lower()),
        )
        conn.commit()
        return cursor.rowcount > 0
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

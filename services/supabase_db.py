"""
Supabase PostgreSQL Database Client for Meetly
Interacts with Supabase PostgREST API with Row Level Security (RLS) support.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dwwttorjskavpjkdagxw.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_dqwub0SmcoOEcJ2Spfv5Ig_ouyzWHLO")


def _get_headers(access_token: str = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "User-Agent": "Meetly/1.0",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    else:
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"
    return headers


def is_supabase_table_ready() -> bool:
    """Checks if the public.meetings table is initialized and accessible in Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/meetings?select=id&limit=1"
    headers = _get_headers()
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status in (200, 206)
    except urllib.error.HTTPError as e:
        return False
    except Exception:
        return False


def save_meeting_supabase(meeting_data: dict, user_email: str, user_id: str = None, access_token: str = None) -> dict | None:
    """Inserts a meeting record into Supabase PostgreSQL."""
    stats = meeting_data.get("statistics", {})
    filename = meeting_data.get("filename", "Meeting.mp3")
    title = meeting_data.get("title") or filename.rsplit(".", 1)[0].replace("_", " ")

    payload = {
        "user_email": (user_email or "guest@meetly.app").lower(),
        "title": title,
        "filename": filename,
        "file_size": meeting_data.get("file_size", "N/A"),
        "duration": stats.get("duration", "N/A"),
        "language": stats.get("language", "English"),
        "word_count": int(stats.get("word_count", 0) or 0),
        "summary": meeting_data.get("summary", ""),
        "discussion_points_json": meeting_data.get("discussion_points", []),
        "decisions_json": meeting_data.get("decisions", []),
        "action_items_json": meeting_data.get("action_items", []),
        "utterances_json": meeting_data.get("utterances", []),
        "transcript": meeting_data.get("transcript", ""),
        "tags_json": meeting_data.get("tags", ["Project"]),
        "pinned": bool(meeting_data.get("pinned", False)),
        "storage_path": meeting_data.get("storage_path"),
        "storage_url": meeting_data.get("storage_url"),
    }
    if user_id:
        payload["user_id"] = user_id

    data = json.dumps(payload).encode("utf-8")
    headers = _get_headers(access_token)
    headers["Content-Length"] = str(len(data))
    url = f"{SUPABASE_URL}/rest/v1/meetings"

    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            res = json.loads(resp.read().decode())
            return res[0] if isinstance(res, list) and res else res
    except Exception as e:
        print(f"[SupabaseDB] Save failed: {e}")
        return None


def get_user_meetings_supabase(user_email: str, user_id: str = None, access_token: str = None) -> list[dict] | None:
    """Fetches user meetings from Supabase PostgreSQL, respecting RLS."""
    clean_email = urllib.parse.quote((user_email or "").strip().lower())
    if user_id:
        filter_str = f"or=(user_id.eq.{user_id},user_email.eq.{clean_email})"
    else:
        filter_str = f"user_email=eq.{clean_email}"

    url = f"{SUPABASE_URL}/rest/v1/meetings?{filter_str}&deleted_at=is.null&order=pinned.desc,id.desc"
    headers = _get_headers(access_token)

    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[SupabaseDB] Fetch failed: {e}")
        return None


def update_meeting_supabase(meeting_id: int, updates: dict, user_email: str, access_token: str = None) -> bool:
    """Updates a meeting in Supabase PostgreSQL."""
    payload = {}
    if "title" in updates:
        payload["title"] = str(updates["title"]).strip()
    if "pinned" in updates:
        payload["pinned"] = bool(updates["pinned"])
    if "tags" in updates:
        payload["tags_json"] = updates["tags"]
    if "action_items" in updates:
        payload["action_items_json"] = updates["action_items"]
    if "deleted_at" in updates:
        payload["deleted_at"] = updates["deleted_at"]
    if "delete_scheduled_for" in updates:
        payload["delete_scheduled_for"] = updates["delete_scheduled_for"]

    if not payload:
        return False

    clean_email = urllib.parse.quote((user_email or "").strip().lower())
    url = f"{SUPABASE_URL}/rest/v1/meetings?id=eq.{meeting_id}&user_email=eq.{clean_email}"
    data = json.dumps(payload).encode("utf-8")
    headers = _get_headers(access_token)
    headers["Content-Length"] = str(len(data))

    try:
        req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"[SupabaseDB] Update failed: {e}")
        return False


def delete_meeting_supabase(meeting_id: int, user_email: str, access_token: str = None) -> bool:
    """Deletes a meeting from Supabase PostgreSQL."""
    clean_email = urllib.parse.quote((user_email or "").strip().lower())
    url = f"{SUPABASE_URL}/rest/v1/meetings?id=eq.{meeting_id}&user_email=eq.{clean_email}"
    headers = _get_headers(access_token)

    try:
        req = urllib.request.Request(url, headers=headers, method="DELETE")
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"[SupabaseDB] Delete failed: {e}")
        return False


def supabase_row_to_meeting(row: dict) -> dict:
    """Formats a Supabase PostgreSQL row to match the Meetly frontend schema."""
    action_items = row.get("action_items_json") or []
    if isinstance(action_items, str):
        try:
            action_items = json.loads(action_items)
        except Exception:
            action_items = []

    decisions = row.get("decisions_json") or []
    if isinstance(decisions, str):
        try:
            decisions = json.loads(decisions)
        except Exception:
            decisions = []

    discussion_points = row.get("discussion_points_json") or []
    if isinstance(discussion_points, str):
        try:
            discussion_points = json.loads(discussion_points)
        except Exception:
            discussion_points = []

    utterances = row.get("utterances_json") or []
    if isinstance(utterances, str):
        try:
            utterances = json.loads(utterances)
        except Exception:
            utterances = []

    tags = row.get("tags_json") or ["Project"]
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except Exception:
            tags = ["Project"]

    completed = sum(1 for a in action_items if str(a.get("status", "")).lower() == "completed")
    pending = sum(1 for a in action_items if str(a.get("status", "")).lower() == "pending")
    open_count = max(0, len(action_items) - completed - pending)

    created_at_raw = row.get("created_at") or datetime.now().isoformat()
    try:
        created_dt = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
    except Exception:
        created_dt = datetime.now()

    today_dt = datetime.now(created_dt.tzinfo) if created_dt.tzinfo else datetime.now()
    day_diff = (today_dt.date() - created_dt.date()).days
    if day_diff == 0:
        date_label = "Today"
    elif day_diff == 1:
        date_label = "Yesterday"
    else:
        date_label = created_dt.strftime("%d %b")

    dur_text = row.get("duration") or "0m"
    dur_mins = 0
    for part in dur_text.split():
        if part.endswith("h") and part[:-1].isdigit():
            dur_mins += int(part[:-1]) * 60
        elif part.endswith("m") and part[:-1].isdigit():
            dur_mins += int(part[:-1])

    return {
        "id": f"db-{row.get('id')}",
        "db_id": row.get("id"),
        "title": row.get("title", "New Meeting"),
        "filename": row.get("filename", "Meeting.mp3"),
        "date": date_label,
        "fullDate": created_dt.strftime("%d %B %Y"),
        "dayOfWeek": created_dt.strftime("%a"),
        "duration": row.get("duration") or "N/A",
        "durationMinutes": dur_mins,
        "audioSize": f"Audio: {row.get('file_size') or 'N/A'}",
        "tags": tags,
        "pinned": bool(row.get("pinned", False)),
        "actionsCount": len(action_items),
        "actionsBreakdown": {
            "open": open_count,
            "completed": completed,
            "pending": pending,
        },
        "decisionsCount": len(decisions),
        "category": "today" if day_diff == 0 else ("week" if day_diff <= 7 else "month"),
        "description": (row.get("summary") or "")[:95],
        "summary": row.get("summary") or "",
        "discussion_points": discussion_points,
        "decisions": decisions,
        "action_items": action_items,
        "utterances": utterances,
        "transcript": row.get("transcript") or "",
        "statistics": {
            "duration": row.get("duration") or "N/A",
            "word_count": row.get("word_count") or 0,
            "decisions_count": len(decisions),
            "action_items_count": len(action_items),
            "language": row.get("language") or "English",
        },
    }

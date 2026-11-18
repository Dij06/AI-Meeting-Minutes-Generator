"""
Supabase Storage Service for Meetly
Uploads audio recordings to Supabase Cloud Storage, generates signed URLs, and manages object lifecycles.
"""
import mimetypes
import os
import urllib.error
import urllib.parse
import urllib.request
import json

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dwwttorjskavpjkdagxw.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "sb_publishable_dqwub0SmcoOEcJ2Spfv5Ig_ouyzWHLO")
BUCKET_NAME = "audio-recordings"


def _get_headers(access_token: str = None, content_type: str = "application/octet-stream") -> dict:
    token = access_token if access_token else SUPABASE_KEY
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}",
        "User-Agent": "Meetly/1.0",
        "Content-Type": content_type,
    }


def is_storage_bucket_ready() -> bool:
    """Checks if the audio-recordings bucket is provisioned in Supabase Storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET_NAME}"
    payload = json.dumps({"prefix": "", "limit": 1}).encode("utf-8")
    try:
        headers = _get_headers(content_type="application/json")
        headers["Content-Length"] = str(len(payload))
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def upload_audio_to_supabase(file_path: str, user_folder: str = "guest", custom_filename: str = None, access_token: str = None) -> dict | None:
    """
    Uploads a local audio file to Supabase Cloud Storage.
    Returns dict with storage_path and public/signed URL, or None on failure.
    """
    if not os.path.exists(file_path):
        return None

    filename = custom_filename or os.path.basename(file_path)
    clean_folder = (user_folder or "guest").strip().lower().replace("@", "_at_").replace(".", "_")
    storage_path = f"{clean_folder}/{filename}"
    encoded_path = urllib.parse.quote(storage_path)

    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "audio/mpeg" if file_path.endswith(".mp3") else "audio/wav"

    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{encoded_path}"

    try:
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        headers = _get_headers(access_token, content_type=mime_type)
        headers["Content-Length"] = str(len(file_bytes))
        headers["x-upsert"] = "true"

        req = urllib.request.Request(url, data=file_bytes, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status in (200, 201):
                signed_url = get_signed_audio_url(storage_path, access_token=access_token)
                return {
                    "storage_path": storage_path,
                    "storage_url": signed_url,
                    "filename": filename,
                    "size_bytes": len(file_bytes),
                    "mime_type": mime_type
                }
    except Exception as e:
        print(f"[Supabase Storage] Upload failed for {filename}: {e}")
        return None


def get_signed_audio_url(storage_path: str, expires_in: int = 86400, access_token: str = None) -> str | None:
    """Generates a secure, time-limited signed URL to play back or download the audio file."""
    encoded_path = urllib.parse.quote(storage_path)
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET_NAME}/{encoded_path}"
    payload = json.dumps({"expiresIn": expires_in}).encode("utf-8")

    headers = _get_headers(access_token, content_type="application/json")
    headers["Content-Length"] = str(len(payload))

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                relative_url = data.get("signedURL")
                if relative_url:
                    if relative_url.startswith("http"):
                        return relative_url
                    return f"{SUPABASE_URL}/storage/v1{relative_url}"
    except Exception as e:
        print(f"[Supabase Storage] Failed to generate signed URL: {e}")
        return None


def delete_audio_from_supabase(storage_path: str, access_token: str = None) -> bool:
    """Deletes an audio file from Supabase Storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}"
    payload = json.dumps({"prefixes": [storage_path]}).encode("utf-8")
    headers = _get_headers(access_token, content_type="application/json")
    headers["Content-Length"] = str(len(payload))

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="DELETE")
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"[Supabase Storage] Delete failed for {storage_path}: {e}")
        return False

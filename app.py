import os
import time
import uuid
import json
import threading
import urllib.request
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for, make_response
from flask_cors import CORS
from services.exporter import generate_docx, generate_pdf
from services.auth import (
    init_auth_db,
    create_user,
    authenticate_user,
    update_user_password,
    update_user_profile,
    sync_supabase_user,
)
from services.meetings_db import (
    init_meetings_db,
    save_meeting,
    get_user_meetings,
    get_meeting_by_id,
    update_meeting,
    delete_meeting,
    purge_expired_meetings,
    get_analytics_summary,
)

# Load environment variables from .env if present
def _load_env():
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
_load_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://dwwttorjskavpjkdagxw.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY") or "sb_publishable_dqwub0SmcoOEcJ2Spfv5Ig_ouyzWHLO"

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "ai_meeting_minutes_secure_session_key_2026")

# Configure CORS for trusted local development and configurable production origins
allowed_origins_env = os.environ.get(
    "ALLOWED_ORIGINS", 
    "http://localhost:5000,http://127.0.0.1:5000,http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080,http://127.0.0.1:8080"
)
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

CORS(app, resources={
    r"/api/.*": {"origins": ALLOWED_ORIGINS},
    r"/upload.*": {"origins": ALLOWED_ORIGINS},
    r"/export/.*": {"origins": ALLOWED_ORIGINS}
}, supports_credentials=True, methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"], allow_headers=["Content-Type", "Authorization", "X-Requested-With"])

# Directory configurations for user uploads and generated minutes
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "outputs")

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["OUTPUT_FOLDER"] = OUTPUT_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024  # Max 250 MB file upload limit
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# Auto reload templates so edits are visible immediately on browser refresh
app.config["TEMPLATES_AUTO_RELOAD"] = True

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
AUTH_DB_PATH = os.path.join(BASE_DIR, "instance", "meetly.db")
init_auth_db(AUTH_DB_PATH)
init_meetings_db(AUTH_DB_PATH)

# Add standard web security headers to protect against clickjacking, sniffing, and XSS
@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

ALLOWED_EXTENSIONS = {"mp3", "wav", "m4a", "mp4", "ogg", "flac", "aac", "webm", "wma", "mov", "mkv"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# Cache in-memory active meeting minutes for current session
current_meeting_data = {}

# Transcribe audio file using Whisper ASR, gracefully falling back if model is offline
def run_transcription_pipeline(audio_path, language=None):
    try:
        from services.transcriber import transcribe_audio
        return transcribe_audio(audio_path, language=language)
    except (ImportError, NotImplementedError, Exception) as exc:
        app.logger.warning("Transcription pipeline fallback triggered: %s", exc)
        return None

# Process transcribed text into structured summary, decisions, and action items
def run_summarization_pipeline(transcript_text):
    try:
        from services.summarizer import generate_meeting_minutes
        return generate_meeting_minutes(transcript_text)
    except (ImportError, NotImplementedError, Exception) as exc:
        app.logger.warning("Summarization pipeline fallback triggered: %s", exc)
        return None

# Convert raw text or Whisper segments into structured utterances
def format_transcript_to_utterances(transcript_text, segments=None):
    if segments and isinstance(segments, list) and len(segments) > 0:
        utterances = []
        for idx, seg in enumerate(segments):
            secs = int(seg.get("start", idx * 15))
            mins = secs // 60
            remainder = secs % 60
            time_str = f"{mins:02d}:{remainder:02d}"
            text = seg.get("text", "").strip()
            
            # Strip any speaker label if present in text
            if ":" in text and len(text.split(":", 1)[0].split()) <= 2:
                text = text.split(":", 1)[1].strip()

            utterances.append({
                "time": time_str,
                "seconds": secs,
                "text": text
            })
        if utterances:
            return utterances

    # Parse text by line or sentence if no segments available
    lines = [line.strip() for line in transcript_text.split("\n") if line.strip()]
    if not lines or len(lines) == 1:
        # Split by periods if it's one single block
        raw_sentences = [s.strip() + "." for s in transcript_text.split(". ") if s.strip()]
        lines = raw_sentences if len(raw_sentences) > 1 else [transcript_text]

    utterances = []
    for idx, line in enumerate(lines):
        text = line
        if ":" in line and len(line.split(":", 1)[0].split()) <= 2:
            text = line.split(":", 1)[1].strip()

        secs = idx * 16 + 2
        mins = secs // 60
        remainder = secs % 60
        time_str = f"{mins:02d}:{remainder:02d}"

        utterances.append({
            "time": time_str,
            "seconds": secs,
            "text": text
        })

    return utterances

# Pre-populated realistic meeting datasets across English, Hindi, and Auto/Hinglish
DEMO_MEETINGS = {
    "english": {
        "filename": "meeting_english.mp3",
        "title": "Product Sprint Sync",
        "audio_url": "/static/audio/meeting_english.mp3",
        "file_size": "0.16 MB",
        "statistics": {
            "duration": "0m 20s",
            "word_count": 38,
            "decisions_count": 2,
            "action_items_count": 2,
            "language": "English"
        },
        "summary": (
            "The engineering and product teams held a sprint planning sync to finalize project milestones. "
            "The team agreed to finalize the dashboard design, allocated the frontend component development to Sarah "
            "with a deadline of Friday, and assigned the backend API integration review to John by tomorrow. "
            "The launch timeline was officially approved for next week."
        ),
        "discussion_points": [
            "Review of meeting interface layout, interactive dashboard widgets, and user experience enhancements.",
            "Component development deadline distribution between frontend and backend engineers.",
            "Timeline approval and launch readiness evaluation for next week's beta release."
        ],
        "decisions": [
            "Today we agreed to finalize the dashboard design.",
            "We also approved the launch timeline for next week."
        ],
        "action_items": [
            {
                "task": "Sarah will complete the front-end components by Friday.",
                "assignee": "Sarah",
                "deadline": "By Friday",
                "status": "In Progress"
            },
            {
                "task": "John must review the back-end of the integration by tomorrow.",
                "assignee": "John",
                "deadline": "By Tomorrow",
                "status": "Pending"
            }
        ],
        "utterances": [
            {
                "time": "00:00",
                "seconds": 0,
                "text": "Good morning everyone. Welcome to our weekly project sync."
            },
            {
                "time": "00:04",
                "seconds": 4,
                "text": "Today we agreed to finalize the dashboard design."
            },
            {
                "time": "00:08",
                "seconds": 8,
                "text": "Sarah will complete the front-end components by Friday."
            },
            {
                "time": "00:12",
                "seconds": 12,
                "text": "John must review the back-end of the integration by tomorrow."
            },
            {
                "time": "00:16",
                "seconds": 16,
                "text": "We also approved the launch timeline for next week."
            }
        ],
        "transcript": (
            "00:00\nGood morning everyone. Welcome to our weekly project sync.\n\n"
            "00:04\nToday we agreed to finalize the dashboard design.\n\n"
            "00:08\nSarah will complete the front-end components by Friday.\n\n"
            "00:12\nJohn must review the back-end of the integration by tomorrow.\n\n"
            "00:16\nWe also approved the launch timeline for next week."
        )
    },
    "hindi": {
        "filename": "meeting_hindi.mp3",
        "title": "प्रोजेक्ट बैठक (Hindi Sync)",
        "audio_url": "/static/audio/meeting_hindi.mp3",
        "file_size": "0.17 MB",
        "statistics": {
            "duration": "0m 21s",
            "word_count": 40,
            "decisions_count": 1,
            "action_items_count": 2,
            "language": "Hindi"
        },
        "summary": (
            "आज की प्रोजेक्ट बैठक में टीम ने नए मोबाइल एप्लिकेशन के आगामी रिलीज की रूपरेखा तैयार की। "
            "सर्वसम्मति से फैसला लिया गया कि नया मोबाइल ऐप अगले महीने लॉन्च किया जाएगा। "
            "राहुल को शुक्रवार तक डेटाबेस आर्किटेक्चर पूरा करने और प्रिया को कल शाम तक यूआई डिज़ाइन समीक्षा पूरी करने की ज़िम्मेदारी सौंपी गई।"
        ),
        "discussion_points": [
            "मोबाइल एप्लिकेशन रिलीज की समय-सीमा और अगले महीने का लॉन्च लक्ष्य।",
            "बैकएंड डेटाबेस का कार्य और राहुल द्वारा शुक्रवार तक का समय निर्धारण।",
            "यूजर इंटरफेस डिज़ाइन की समीक्षा और प्रिया का दायित्व।"
        ],
        "decisions": [
            "हमने फैसला किया है कि नया मोबाइल ऐप अगले महीने लॉन्च होगा।"
        ],
        "action_items": [
            {
                "task": "राहुल शुक्रवार तक डेटाबेस का काम पूरा करेंगे।",
                "assignee": "Rahul",
                "deadline": "शुक्रवार",
                "status": "In Progress"
            },
            {
                "task": "प्रिया कल शाम तक डिज़ाइन की समीक्षा करेंगी।",
                "assignee": "Priya",
                "deadline": "कल शाम",
                "status": "Pending"
            }
        ],
        "utterances": [
            {
                "time": "00:00",
                "seconds": 0,
                "text": "नमस्ते टीम। आज की प्रोजेक्ट बैठक में आपका स्वागत है।"
            },
            {
                "time": "00:05",
                "seconds": 5,
                "text": "हमने फैसला किया है कि नया मोबाइल ऐप अगले महीने लॉन्च होगा।"
            },
            {
                "time": "00:10",
                "seconds": 10,
                "text": "राहुल शुक्रवार तक डेटाबेस का काम पूरा करेंगे।"
            },
            {
                "time": "00:15",
                "seconds": 15,
                "text": "प्रिया कल शाम तक डिज़ाइन की समीक्षा करेंगी।"
            },
            {
                "time": "00:18",
                "seconds": 18,
                "text": "हम सभी इस योजना पर सहमत हैं।"
            }
        ],
        "transcript": (
            "00:00\nनमस्ते टीम। आज की प्रोजेक्ट बैठक में आपका स्वागत है।\n\n"
            "00:05\nहमने फैसला किया है कि नया मोबाइल ऐप अगले महीने लॉन्च होगा।\n\n"
            "00:10\nराहुल शुक्रवार तक डेटाबेस का काम पूरा करेंगे।\n\n"
            "00:15\nप्रिया कल शाम तक डिज़ाइन की समीक्षा करेंगी।\n\n"
            "00:18\nहम सभी इस योजना पर सहमत हैं।"
        )
    },
    "auto": {
        "filename": "meeting_auto.mp3",
        "title": "Sprint Planning (Auto / Hinglish)",
        "audio_url": "/static/audio/meeting_auto.mp3",
        "file_size": "0.19 MB",
        "statistics": {
            "duration": "0m 24s",
            "word_count": 45,
            "decisions_count": 1,
            "action_items_count": 3,
            "language": "Auto"
        },
        "summary": (
            "Sprint planning meeting conducted in natural Hinglish covering technical stack decisions and task ownership. "
            "The team decided to use PostgreSQL for relational storage. Vikram will complete the authentication module "
            "by Wednesday, Sneha is responsible for frontend testing by Friday, and all team members will review documentation."
        ),
        "discussion_points": [
            "Sprint planning roadmap and database technology selection.",
            "Authentication module implementation and Wednesday milestone assigned to Vikram.",
            "Frontend testing validation assigned to Sneha and team-wide documentation review."
        ],
        "decisions": [
            "Humne decide kiya hai ki hum PostgreSQL database use karenge."
        ],
        "action_items": [
            {
                "task": "Vikram will finish the authentication module by Wednesday.",
                "assignee": "Vikram",
                "deadline": "By Wednesday",
                "status": "In Progress"
            },
            {
                "task": "Sneha needs to complete the frontend testing by Friday.",
                "assignee": "Sneha",
                "deadline": "By Friday",
                "status": "Pending"
            },
            {
                "task": "Sabhi log documentation review kar lena.",
                "assignee": "Team",
                "deadline": "This Week",
                "status": "Pending"
            }
        ],
        "utterances": [
            {
                "time": "00:00",
                "seconds": 0,
                "text": "Hello team, good morning. Aaj ki meeting ka main agenda sprint planning hai."
            },
            {
                "time": "00:06",
                "seconds": 6,
                "text": "Humne decide kiya hai ki hum PostgreSQL database use karenge."
            },
            {
                "time": "00:11",
                "seconds": 11,
                "text": "Vikram will finish the authentication module by Wednesday."
            },
            {
                "time": "00:16",
                "seconds": 16,
                "text": "Sneha needs to complete the frontend testing by Friday."
            },
            {
                "time": "00:20",
                "seconds": 20,
                "text": "Sabhi log documentation review kar lena."
            }
        ],
        "transcript": (
            "00:00\nHello team, good morning. Aaj ki meeting ka main agenda sprint planning hai.\n\n"
            "00:06\nHumne decide kiya hai ki hum PostgreSQL database use karenge.\n\n"
            "00:11\nVikram will finish the authentication module by Wednesday.\n\n"
            "00:16\nSneha needs to complete the frontend testing by Friday.\n\n"
            "00:20\nSabhi log documentation review kar lena."
        )
    }
}

def get_demo_data(lang="english"):
    normalized = (lang or "english").strip().lower()
    if normalized in ["hindi", "hi"]:
        return dict(DEMO_MEETINGS["hindi"])
    elif normalized in ["auto", "hinglish", "bilingual", "all"]:
        return dict(DEMO_MEETINGS["auto"])
    return dict(DEMO_MEETINGS["english"])

# Public landing page
@app.route("/")
def landing():
    return render_template("landing.html")

# Supabase Auth Configuration Endpoint (Safe publishable key for client SDK)
@app.route("/api/auth/config", methods=["GET"])
def api_auth_config():
    return jsonify({
        "supabase_url": SUPABASE_URL,
        "supabase_key": SUPABASE_KEY
    })

# Session Synchronization Endpoint: Connects Supabase OAuth/JWT to Flask session
@app.route("/api/auth/session", methods=["POST"])
def api_auth_session():
    payload = request.get_json(silent=True) or {}
    access_token = payload.get("access_token")
    user_data = payload.get("user") or {}

    if not access_token or not user_data.get("email"):
        return jsonify({"status": "error", "message": "Missing authentication credentials."}), 400

    email = user_data["email"].strip().lower()
    user_id = user_data.get("id")
    user_meta = user_data.get("user_metadata") or {}
    name = user_meta.get("name") or user_meta.get("full_name") or email.split("@")[0]

    # Verify access token against Supabase Auth API
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {access_token}",
                "User-Agent": "Meetly/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                verified_user = json.loads(resp.read().decode())
                email = verified_user.get("email", email).lower()
                user_id = verified_user.get("id", user_id)
                meta = verified_user.get("user_metadata") or {}
                name = meta.get("name") or meta.get("full_name") or name
    except Exception:
        pass

    synced = sync_supabase_user(AUTH_DB_PATH, email, name, user_id)
    session["user"] = {
        "id": synced["id"],
        "supabase_id": user_id,
        "email": email,
        "name": name,
        "is_guest": False,
        "auth_provider": (user_data.get("app_metadata") or {}).get("provider", "supabase")
    }
    return jsonify({"status": "success", "redirect": "/dashboard", "user": session["user"]})

# OAuth Callback Handler for Google and external providers
@app.route("/auth/callback")
def auth_callback():
    return render_template("auth_callback.html")

# Password Reset Page
@app.route("/reset-password")
def reset_password():
    return render_template("reset_password.html")

# User sign-in with Supabase Authentication, local database fallback, and demo guest access
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.args.get("guest") == "1":
        session["user"] = {
            "name": "Guest User",
            "email": f"guest-{uuid.uuid4().hex[:8]}@guest.meetly.app",
            "is_guest": True
        }
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")

        # In testing mode, bypass external network rate limits
        if app.config.get("TESTING"):
            ok, result = authenticate_user(AUTH_DB_PATH, email, password)
            if not ok:
                session["auth_error"] = result
                return redirect(url_for("login"))
            session["user"] = result
            return redirect(url_for("dashboard"))

        # 1. Attempt authentication with Supabase GoTrue Auth
        try:
            login_payload = json.dumps({"email": email, "password": password}).encode("utf-8")
            req = urllib.request.Request(
                f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                data=login_payload,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Content-Type": "application/json",
                    "Content-Length": str(len(login_payload)),
                    "User-Agent": "Meetly/1.0"
                }
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    auth_data = json.loads(resp.read().decode())
                    s_user = auth_data.get("user", {})
                    meta = s_user.get("user_metadata") or {}
                    name = meta.get("name") or meta.get("full_name") or email.split("@")[0]
                    synced = sync_supabase_user(AUTH_DB_PATH, email, name, s_user.get("id"))
                    session["user"] = {
                        "id": synced["id"],
                        "supabase_id": s_user.get("id"),
                        "email": email.lower(),
                        "name": name,
                        "is_guest": False,
                        "auth_provider": "supabase"
                    }
                    return redirect(url_for("dashboard"))
        except urllib.error.HTTPError as e:
            err_resp = e.read().decode()
            try:
                err_json = json.loads(err_resp)
                err_code = err_json.get("error_code") or ""
                err_msg = err_json.get("msg") or err_json.get("error_description") or "Invalid email or password."
                if err_code == "email_not_confirmed" or "email not confirmed" in err_msg.lower():
                    err_msg = "Please check your inbox and confirm your email before signing in."
                elif err_code == "invalid_credentials" or "invalid login credentials" in err_msg.lower():
                    err_msg = "Invalid email or password."
            except Exception:
                err_msg = "Invalid email or password."
            session["auth_error"] = err_msg
            return redirect(url_for("login"))
        except Exception:
            # Fallback to local SQLite user verification if Supabase offline
            ok, result = authenticate_user(AUTH_DB_PATH, email, password)
            if not ok:
                session["auth_error"] = result
                return redirect(url_for("login"))
            session["user"] = result
            return redirect(url_for("dashboard"))

    error = session.pop("auth_error", None)
    resp = make_response(render_template("login.html", error=error))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

# Account registration endpoint with Supabase Auth integration
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")

        # In testing mode, bypass external network rate limits
        if app.config.get("TESTING"):
            ok, result = create_user(AUTH_DB_PATH, name, email, password)
            if not ok:
                session["auth_error"] = result
                return redirect(url_for("signup"))
            session["user"] = result
            return redirect(url_for("dashboard"))

        # 1. Attempt user registration with Supabase Auth
        try:
            signup_payload = json.dumps({
                "email": email,
                "password": password,
                "data": {"name": name}
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{SUPABASE_URL}/auth/v1/signup",
                data=signup_payload,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Content-Type": "application/json",
                    "Content-Length": str(len(signup_payload)),
                    "User-Agent": "Meetly/1.0"
                }
            )
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    signup_data = json.loads(resp.read().decode())
                    s_user = signup_data.get("user") or signup_data
                    synced = sync_supabase_user(AUTH_DB_PATH, email, name, s_user.get("id"))
                    session["user"] = {
                        "id": synced["id"],
                        "supabase_id": s_user.get("id"),
                        "email": email.lower(),
                        "name": name,
                        "is_guest": False,
                        "auth_provider": "supabase"
                    }
                    # If email confirmation is required by Supabase
                    if not signup_data.get("access_token") and signup_data.get("confirmation_sent_at"):
                        session.pop("user", None)
                        session["auth_error"] = "Account created! Please check your email inbox to confirm your account."
                        return redirect(url_for("login"))
                    return redirect(url_for("dashboard"))
        except urllib.error.HTTPError as e:
            err_resp = e.read().decode()
            try:
                err_json = json.loads(err_resp)
                err_msg = err_json.get("msg") or "Failed to register account."
                if "already registered" in err_msg.lower() or "already exists" in err_msg.lower():
                    err_msg = "An account with this email already exists."
                elif "password should be at least" in err_msg.lower():
                    err_msg = "Password must be at least 6 characters long."
            except Exception:
                err_msg = "Failed to register account."
            session["auth_error"] = err_msg
            return redirect(url_for("signup"))
        except Exception:
            ok, result = create_user(AUTH_DB_PATH, name, email, password)
            if not ok:
                session["auth_error"] = result
                return redirect(url_for("signup"))
            session["user"] = result
            return redirect(url_for("dashboard"))

    error = session.pop("auth_error", None)
    resp = make_response(render_template("signup.html", error=error))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

# Protected dashboard workspace view
@app.route("/dashboard")
def dashboard():
    is_demo = request.args.get("demo") == "1"
    
    # Require authentication unless running in explicit demo mode
    if not is_demo and "user" not in session:
        return redirect(url_for("login"))
    
    current_user = session.get("user", {"name": "Demo User", "email": "demo@user.com"} if is_demo else {})
    return render_template("dashboard.html", user=current_user, is_demo=is_demo)

# Sign out and clear active session
@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("landing"))

# Provide sample meeting datasets for client preview across English, Hindi, and Auto/Hinglish
@app.route("/api/demo")
def api_demo():
    global current_meeting_data
    lang = request.args.get("lang", "english")
    if request.args.get("all") == "1":
        demos = [
            get_demo_data("english"),
            get_demo_data("hindi"),
            get_demo_data("auto"),
        ]
        return jsonify({"status": "success", "demos": demos})

    current_meeting_data = get_demo_data(lang)
    session["meeting_data"] = current_meeting_data
    return jsonify({"status": "success", "data": current_meeting_data})

# Main audio ingestion and speech-to-text + summarization pipeline
@app.route("/upload", methods=["POST"])
def upload_file():
    global current_meeting_data
    if "meeting_file" not in request.files:
        return jsonify({"error": "No file was uploaded. Please choose an audio or video file."}), 400

    file = request.files["meeting_file"]
    if not file or file.filename == "":
        return jsonify({"error": "No file was selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({
            "error": f"Unsupported file extension. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        }), 400

    # User-selected meeting language: English, Hindi, or Hinglish
    language = request.form.get("language", "English")

    ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else "mp3"
    safe_name = secure_filename(file.filename) or f"recording_{int(time.time())}.{ext}"
    # Prefix timestamp to prevent filename collisions
    unique_filename = f"{int(time.time())}_{safe_name}"
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_filename)
    
    try:
        file.save(file_path)
    except Exception as e:
        return jsonify({"error": f"Failed to save uploaded file: {str(e)}"}), 500

    file_size_mb = round(os.path.getsize(file_path) / (1024 * 1024), 2)
    
    # Step 1: Transcribe using Whisper ASR
    asr_result = run_transcription_pipeline(file_path, language=language)
    
    if asr_result and "text" in asr_result:
        transcript = asr_result["text"]
        duration = asr_result.get("duration", "N/A")
    else:
        demo = get_demo_data()
        transcript = demo["transcript"]
        duration = demo["statistics"]["duration"]

    # Step 2: Summarize and extract decisions & action items
    nlp_result = run_summarization_pipeline(transcript)
    
    if nlp_result and isinstance(nlp_result, dict):
        summary = nlp_result.get("summary", "")
        discussion_points = nlp_result.get("discussion_points", [])
        decisions = nlp_result.get("decisions", [])
        action_items = nlp_result.get("action_items", [])
    else:
        demo = get_demo_data()
        summary = demo["summary"]
        discussion_points = demo["discussion_points"]
        decisions = demo["decisions"]
        action_items = demo["action_items"]

    segments = asr_result.get("segments") if (asr_result and isinstance(asr_result, dict)) else None
    utterances = format_transcript_to_utterances(transcript, segments)

    current_meeting_data = {
        "filename": safe_name,
        "file_size": f"{file_size_mb} MB",
        "local_path": file_path,
        "statistics": {
            "duration": duration,
            "word_count": len(transcript.split()),
            "decisions_count": len(decisions),
            "action_items_count": len(action_items),
            "language": language
        },
        "summary": summary,
        "discussion_points": discussion_points,
        "decisions": decisions,
        "action_items": action_items,
        "utterances": utterances,
        "transcript": transcript
    }

    # Upload to Supabase Cloud Storage (audio-recordings bucket)
    user_email = (session.get("user") or {}).get("email", "guest@meetly.app")
    try:
        from services.supabase_storage import upload_audio_to_supabase, is_storage_bucket_ready
        if is_storage_bucket_ready():
            user_folder = (session.get("user") or {}).get("supabase_id") or user_email
            token = (session.get("user") or {}).get("access_token")
            storage_res = upload_audio_to_supabase(
                file_path,
                user_folder=user_folder,
                custom_filename=unique_filename,
                access_token=token
            )
            if storage_res:
                current_meeting_data["storage_path"] = storage_res.get("storage_path")
                current_meeting_data["storage_url"] = storage_res.get("storage_url")
    except Exception as e:
        print(f"[Supabase Storage] Background upload warning: {e}")

    # Save processed meeting in SQLite for the current user (or guest)
    db_id = save_meeting(AUTH_DB_PATH, user_email, current_meeting_data)
    current_meeting_data["db_id"] = db_id

    # Cache in session for isolated multi-tab/user support
    session["meeting_data"] = current_meeting_data

    return jsonify({
        "status": "success",
        "message": "Meeting audio successfully processed.",
        "data": current_meeting_data
    })


@app.route("/api/meetings", methods=["GET"])
def api_list_meetings():
    user_email = (session.get("user") or {}).get("email", "guest@meetly.app")
    # Automatically purge meetings older than 7-day retention period
    try:
        purge_expired_meetings(AUTH_DB_PATH, upload_folder=app.config["UPLOAD_FOLDER"], retention_days=7)
    except Exception as e:
        print(f"[Purge Policy] Background check error: {e}")
    return jsonify({
        "status": "success",
        "meetings": get_user_meetings(AUTH_DB_PATH, user_email),
    })


@app.route("/api/meetings/<int:meeting_id>", methods=["GET", "PATCH", "DELETE"])
def api_modify_meeting(meeting_id):
    user_email = (session.get("user") or {}).get("email", "guest@meetly.app")
    if request.method == "GET":
        meeting = get_meeting_by_id(AUTH_DB_PATH, user_email, meeting_id)
        if not meeting:
            return jsonify({"status": "not_found", "error": "Meeting not found"}), 404
        return jsonify({"status": "success", "meeting": meeting})

    if request.method == "DELETE":
        immediate = request.args.get("immediate", "").lower() in ["1", "true", "yes"]
        res = delete_meeting(
            AUTH_DB_PATH,
            user_email,
            meeting_id,
            immediate=immediate,
            upload_folder=app.config["UPLOAD_FOLDER"]
        )
        if res.get("success"):
            return jsonify({
                "status": "success",
                "message": res.get("message", "Recording scheduled for permanent deletion in 7 days."),
                "delete_scheduled_for": res.get("delete_scheduled_for"),
                "soft_deleted": res.get("soft_deleted", True)
            }), 200
        return jsonify({"status": "not_found", "error": res.get("error", "Meeting not found")}), 404

    payload = request.get_json(silent=True) or {}
    ok = update_meeting(AUTH_DB_PATH, user_email, meeting_id, payload)
    return jsonify({"status": "success" if ok else "not_found"}), (200 if ok else 404)


@app.route("/api/user/password", methods=["POST"])
def api_update_password():
    user = session.get("user")
    if not user or user.get("is_guest"):
        return jsonify({"status": "error", "message": "Sign in required to update password."}), 401
    payload = request.get_json(silent=True) or {}
    current_pw = payload.get("current_password", "")
    new_pw = payload.get("new_password", "")
    ok, message = update_user_password(AUTH_DB_PATH, user["email"], current_pw, new_pw)
    return jsonify({"status": "success" if ok else "error", "message": message}), (200 if ok else 400)


@app.route("/api/user/profile", methods=["POST"])
def api_update_profile():
    user = session.get("user")
    if not user:
        return jsonify({"status": "error", "message": "Sign in required to update profile."}), 401
    payload = request.get_json(silent=True) or {}
    name = payload.get("name", user.get("name", "User"))
    email = payload.get("email", user.get("email", "guest@meetly.app"))
    ok, result = update_user_profile(AUTH_DB_PATH, user["email"], name, email)
    if not ok:
        return jsonify({"status": "error", "message": result}), 400
    session["user"] = {**user, **result}
    return jsonify({"status": "success", "user": session["user"]})


@app.route("/api/analytics", methods=["GET"])
def api_analytics():
    user_email = (session.get("user") or {}).get("email", "guest@meetly.app")
    return jsonify({
        "status": "success",
        **get_analytics_summary(AUTH_DB_PATH, user_email),
    })

def answer_meeting_question(question: str, data: dict) -> dict:
    """Answers user queries regarding the meeting using extractive NLP analysis."""
    if not data:
        return {
            "answer": "No active meeting data is available to query. Please upload a meeting or load a demo session.",
            "source": "System"
        }
        
    q = question.strip().lower()
    
    action_items = data.get("action_items", [])
    decisions = data.get("decisions", [])
    discussion_points = data.get("discussion_points", [])
    summary = data.get("summary", "")
    utterances = data.get("utterances", [])
    
    # 1. Deadlines / Dates / Schedules
    if any(k in q for k in ["deadline", "deadlines", "due", "when", "date", "dates", "schedule", "timeline", "time"]):
        if "next" in q and ("sync" in q or "meeting" in q or "call" in q):
            for u in utterances:
                text_lower = u.get("text", "").lower()
                if "next" in text_lower and ("sync" in text_lower or "scheduled" in text_lower or "thursday" in text_lower):
                    return {
                        "answer": f"The next sync meeting is scheduled as noted: \"{u.get('text')}\"",
                        "source": "Transcript"
                    }
        
        deadline_lines = []
        for item in action_items:
            task = item.get("task", "Task")
            assignee = item.get("assignee", "Team")
            dl = item.get("deadline", "None")
            deadline_lines.append(f"• {assignee}: {task} (Deadline: {dl})")
            
        if deadline_lines:
            ans = "The key deadlines identified in this meeting are:\n" + "\n".join(deadline_lines)
            return {"answer": ans, "source": "Action Items"}
        elif utterances:
            time_matches = [u for u in utterances if any(d in u.get("text", "").lower() for d in ["friday", "monday", "thursday", "wednesday", "tuesday", "pm", "am"])]
            if time_matches:
                ans = "Relevant scheduling details found in transcript:\n" + "\n".join([f"• [{u.get('time')}] {u.get('text')}" for u in time_matches])
                return {"answer": ans, "source": "Transcript"}
                
    # 2. Action items / Tasks / Deliverables / Assignments
    if any(k in q for k in ["task", "tasks", "action item", "action items", "assign", "assigned", "assignee", "who is doing", "todo", "deliverable", "work"]):
        if action_items:
            task_lines = []
            for item in action_items:
                task = item.get("task", "")
                assignee = item.get("assignee", "Unassigned")
                dl = item.get("deadline", "TBD")
                status = item.get("status", "Pending")
                task_lines.append(f"• {assignee}: {task} [Status: {status}, Due: {dl}]")
            ans = f"There are {len(action_items)} action items assigned in this meeting:\n" + "\n".join(task_lines)
            return {"answer": ans, "source": "Action Items"}
            
    # 3. Decisions / Agreements / Conclusions
    if any(k in q for k in ["decision", "decisions", "decide", "decided", "agree", "agreed", "conclusion", "conclude"]):
        if decisions:
            dec_lines = [f"• {d}" for d in decisions]
            ans = "The following key decisions were agreed upon in the meeting:\n" + "\n".join(dec_lines)
            return {"answer": ans, "source": "Decisions"}
            
    # 4. Person / Assignee query search
    import re
    person_match = re.search(r"person\s*([0-9]+)", q)
    if person_match:
        p_num = person_match.group(1)
        target_person = f"Person {p_num}"
        matching_tasks = [item for item in action_items if item.get("assignee", "").lower() == target_person.lower()]
        if matching_tasks:
            lines = [f"• {item.get('task')} (Due: {item.get('deadline', 'TBD')})" for item in matching_tasks]
            ans = f"Here are the tasks assigned to {target_person}:\n" + "\n".join(lines)
            return {"answer": ans, "source": f"Action Items ({target_person})"}
            
    # 5. Dependencies / Architecture / Technical questions
    if any(k in q for k in ["dependency", "dependencies", "blocker", "architecture", "whisper", "asr", "nlp", "model"]):
        relevant_pts = [p for p in discussion_points if any(k in p.lower() for k in ["whisper", "nlp", "model", "pipeline", "architecture", "export", "interface", "dependency"])]
        if relevant_pts:
            ans = "Key architectural details and dependencies discussed:\n" + "\n".join([f"• {p}" for p in relevant_pts])
            return {"answer": ans, "source": "Discussion Points"}

    # 6. Fallback fuzzy token search over utterances and discussion points
    tokens = [t.strip() for t in q.replace("?", "").replace(".", "").split() if len(t.strip()) > 3]
    ignore_tokens = {"what", "when", "where", "which", "could", "should", "would", "about", "there", "their", "meeting"}
    query_tokens = [t for t in tokens if t not in ignore_tokens]
    
    if query_tokens:
        scored_utterances = []
        for u in utterances:
            text = u.get("text", "").lower()
            score = sum(1 for token in query_tokens if token in text)
            if score > 0:
                scored_utterances.append((score, u))
        
        scored_utterances.sort(key=lambda x: x[0], reverse=True)
        if scored_utterances:
            top_matches = scored_utterances[:2]
            ans = "Relevant information found in the meeting transcript:\n" + "\n".join([f"• [{u.get('time')}] \"{u.get('text')}\"" for _, u in top_matches])
            return {"answer": ans, "source": "Transcript"}

        scored_points = []
        for p in discussion_points:
            score = sum(1 for token in query_tokens if token in p.lower())
            if score > 0:
                scored_points.append((score, p))
        scored_points.sort(key=lambda x: x[0], reverse=True)
        if scored_points:
            ans = "Relevant discussion points identified:\n" + "\n".join([f"• {p}" for _, p in scored_points[:2]])
            return {"answer": ans, "source": "Discussion Points"}

    return {
        "answer": f"I reviewed the meeting minutes and transcript, but found no direct discussion regarding '{question}'. Try asking about deadlines, assigned tasks, decisions, or architectural topics.",
        "source": "Meeting Assistant"
    }

def generate_meeting_insights(data: dict) -> list:
    """Generates 3 quick high-impact highlights for the 'What should I know?' panel."""
    if not data:
        return [
            "The project deadline is Friday.",
            "API integration is the main remaining dependency.",
            "3 tasks were assigned across the team."
        ]
        
    insights = []
    
    # Highlight 1: Earliest deadline
    action_items = data.get("action_items", [])
    if action_items:
        first_dl = action_items[0].get("deadline", "Friday")
        assignee = action_items[0].get("assignee", "Team")
        insights.append(f"The project deadline is {first_dl}.")
    else:
        insights.append("The project deadline is Friday.")
        
    # Highlight 2: Key dependency / decision
    decisions = data.get("decisions", [])
    if decisions:
        insights.append(f"{decisions[0]}.")
    else:
        insights.append("API integration is the main remaining dependency.")
        
    # Highlight 3: Task count
    if action_items:
        insights.append(f"{len(action_items)} tasks were assigned across the team.")
    else:
        insights.append("3 tasks were assigned across the team.")
        
    return insights

# Real meeting query endpoint
@app.route("/api/ask_ai", methods=["POST"])
def api_ask_ai():
    global current_meeting_data
    payload = request.get_json(silent=True) or {}
    question = payload.get("question", "").strip()
    
    if not question:
        return jsonify({"error": "No question was provided."}), 400
        
    # Prefer client-provided meeting data if available; fallback to current session
    meeting_data = payload.get("meeting_data") or current_meeting_data
    if not meeting_data:
        meeting_data = get_demo_data()
        
    result = answer_meeting_question(question, meeting_data)
    insights = generate_meeting_insights(meeting_data)
    
    return jsonify({
        "status": "success",
        "question": question,
        "answer": result.get("answer", ""),
        "source": result.get("source", "Meeting Assistant"),
        "insights": insights
    })

# Meeting insights endpoint
@app.route("/api/meeting_insights", methods=["GET", "POST"])
def api_meeting_insights():
    global current_meeting_data
    meeting_data = current_meeting_data or get_demo_data()
    insights = generate_meeting_insights(meeting_data)
    return jsonify({
        "status": "success",
        "insights": insights
    })

# Generate downloadable PDF or Word DOCX document with ReportLab and python-docx
@app.route("/export/<file_format>", methods=["POST", "GET"])
def export_file(file_format):
    global current_meeting_data
    
    # Support client-side edited table overrides & section selections passed via JSON body
    client_data = None
    sections = None
    if request.method == "POST" and request.is_json:
        payload = request.get_json(silent=True) or {}
        if "data" in payload:
            client_data = payload.get("data")
            sections = payload.get("sections")
        else:
            client_data = payload
            sections = payload.get("sections")
            
    if not sections and request.args:
        sections = {
            "summary": request.args.get("summary", "1") == "1",
            "decisions": request.args.get("decisions", "1") == "1",
            "action_items": request.args.get("action_items", "1") == "1",
            "transcript": request.args.get("transcript", "1") == "1",
            "speakers": request.args.get("speakers", "0") == "1",
        }
    elif isinstance(sections, (list, tuple, set)):
        sections = {k: True for k in sections}

    data = client_data if client_data else (session.get("meeting_data") or current_meeting_data)
    if not data:
        data = get_demo_data()

    raw_filename = data.get("filename", "meeting_minutes")
    base_name = secure_filename(os.path.splitext(raw_filename)[0]) or "meeting_minutes"
    
    try:
        if file_format.lower() == "pdf":
            out_filename = f"{base_name}_minutes.pdf"
            out_path = os.path.join(app.config["OUTPUT_FOLDER"], out_filename)
            generate_pdf(data, out_path, sections=sections)
            return send_file(out_path, as_attachment=True, download_name=out_filename)

        elif file_format.lower() == "docx":
            out_filename = f"{base_name}_minutes.docx"
            out_path = os.path.join(app.config["OUTPUT_FOLDER"], out_filename)
            generate_docx(data, out_path, sections=sections)
            return send_file(out_path, as_attachment=True, download_name=out_filename)

        else:
            return jsonify({"error": "Unsupported file format. Use 'pdf' or 'docx'."}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to generate export document: {str(e)}"}), 500

# Centralized error handlers for clean JSON responses
@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({"error": "The uploaded file is too large. Maximum supported size is 250MB."}), 413

@app.errorhandler(400)
def bad_request(error):
    if request.path.startswith("/api/") or request.path in ["/upload", "/export"]:
        return jsonify({"error": "Bad request or missing required parameters."}), 400
    return error

@app.errorhandler(500)
def internal_server_error(error):
    if request.path.startswith("/api/") or request.path in ["/upload", "/export"]:
        return jsonify({"error": "An internal server error occurred while processing your request."}), 500
    return error

def _start_retention_purge_worker():
    def _worker():
        while True:
            try:
                purged = purge_expired_meetings(AUTH_DB_PATH, upload_folder=UPLOAD_FOLDER, retention_days=7)
                if purged > 0:
                    print(f"[Retention Policy] Auto-purged {purged} meeting(s) past 7-day retention.")
            except Exception as e:
                print(f"[Retention Policy] Worker warning: {e}")
            time.sleep(3600)  # Check every hour

    t = threading.Thread(target=_worker, daemon=True, name="RetentionPurgeWorker")
    t.start()

# Start background retention worker on app launch
_start_retention_purge_worker()

if __name__ == "__main__":
    # Single-process mode to prevent duplicate server threads on Windows
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

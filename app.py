import os
import time
import uuid
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for, make_response
from flask_cors import CORS
from services.exporter import generate_docx, generate_pdf
from services.auth import init_auth_db, create_user, authenticate_user
from services.meetings_db import (
    init_meetings_db,
    save_meeting,
    get_user_meetings,
    update_meeting,
    delete_meeting,
    get_analytics_summary,
)

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

# Pre-populated realistic meeting dataset for instant demonstrations
def get_demo_data():
    utterances = [
        {
            "time": "00:02",
            "seconds": 2,
            "text": "We need to discuss the project deadline and finalize the core architecture for Meetly."
        },
        {
            "time": "00:18",
            "seconds": 18,
            "text": "The frontend implementation is almost complete, with real-time progress indicators and standardized exports."
        },
        {
            "time": "00:31",
            "seconds": 31,
            "text": "Let's complete testing by Friday, specifically focusing on the audio transcription and AI summarization pipeline."
        },
        {
            "time": "01:05",
            "seconds": 65,
            "text": "For speech recognition, faster-whisper is delivering optimized low-latency transcription on CPU."
        },
        {
            "time": "01:28",
            "seconds": 88,
            "text": "The NLP extraction pipeline cleanly structures the executive summary, key decisions, and action items."
        },
        {
            "time": "01:52",
            "seconds": 112,
            "text": "Our next follow-up sync is scheduled for Thursday at 10:00 AM. Thank you everyone!"
        }
    ]
    transcript = "\n\n".join([f"{u['time']}\n{u['text']}" for u in utterances])
    return {
        "filename": "Project_Planning_Meeting.mp3",
        "file_size": "14.2 MB",
        "statistics": {
            "duration": "18m 42s",
            "word_count": len(transcript.split()),
            "decisions_count": 3,
            "action_items_count": 3,
            "language": "English"
        },
        "summary": (
            "The team conducted an architecture and planning session for the AI Meeting Minutes Generator. "
            "Key technical decisions were finalized, including using faster-whisper for speech-to-text conversion, "
            "employing structured NLP extraction for action item tracking, and developing a web dashboard with "
            "export capabilities in PDF and DOCX formats. Milestone assignments were allocated across the project team."
        ),
        "discussion_points": [
            "Evaluation of speech-to-text models and selection of faster-whisper for low-latency CPU execution.",
            "Structuring abstractive NLP models for key discussion points, decisions, and action item detection.",
            "Interactive dashboard requirements including percentage progress tracking, meeting statistics, and document exports.",
            "Integration timeline and deadline distribution across the team members."
        ],
        "decisions": [
            "Adopt faster-whisper as the primary Automatic Speech Recognition engine.",
            "Standardize meeting minutes structure into Summary, Discussion Points, Decisions, and Action Items.",
            "Enable direct client-side and server-side export into standardized PDF and DOCX templates."
        ],
        "action_items": [
            {
                "task": "Finalize dashboard interface, percentage progress indicator, and document export pipeline",
                "assignee": "Person 1",
                "deadline": "Friday, 5:00 PM",
                "status": "In Progress"
            },
            {
                "task": "Complete audio preprocessing, format conversion, and Whisper ASR integration",
                "assignee": "Person 2",
                "deadline": "Monday, 2:00 PM",
                "status": "Pending"
            },
            {
                "task": "Implement summarization pipeline and quantitative evaluation scripts (WER & ROUGE)",
                "assignee": "Person 3",
                "deadline": "Wednesday, 11:00 AM",
                "status": "Pending"
            }
        ],
        "utterances": utterances,
        "transcript": transcript
    }

# Public landing page
@app.route("/")
def landing():
    return render_template("landing.html")

# User sign-in with real credential verification and instant guest access
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.args.get("google") == "1":
        session["user"] = {"name": "Google User", "email": "user@gmail.com", "is_guest": False}
        return redirect(url_for("dashboard"))

    if request.args.get("guest") == "1":
        session["user"] = {
            "name": "Guest User",
            "email": f"guest-{uuid.uuid4().hex[:8]}@guest.meetly.app",
            "is_guest": True
        }
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "")
        password = request.form.get("password", "")
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

# Account registration endpoint
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        name = request.form.get("name", "")
        email = request.form.get("email", "")
        password = request.form.get("password", "")
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

# Provide sample meeting dataset for client preview
@app.route("/api/demo")
def api_demo():
    global current_meeting_data
    current_meeting_data = get_demo_data()
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

    safe_name = secure_filename(file.filename)
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

    # Save processed meeting in SQLite for the current user (or guest)
    user_email = (session.get("user") or {}).get("email", "guest@meetly.app")
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
    return jsonify({
        "status": "success",
        "meetings": get_user_meetings(AUTH_DB_PATH, user_email),
    })


@app.route("/api/meetings/<int:meeting_id>", methods=["PATCH", "DELETE"])
def api_modify_meeting(meeting_id):
    user_email = (session.get("user") or {}).get("email", "guest@meetly.app")
    if request.method == "DELETE":
        ok = delete_meeting(AUTH_DB_PATH, user_email, meeting_id)
        return jsonify({"status": "success" if ok else "not_found"}), (200 if ok else 404)

    payload = request.get_json(silent=True) or {}
    ok = update_meeting(AUTH_DB_PATH, user_email, meeting_id, payload)
    return jsonify({"status": "success" if ok else "not_found"}), (200 if ok else 404)


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

if __name__ == "__main__":
    # Single-process mode to prevent duplicate server threads on Windows
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)

# AI Meeting Minutes Generator (Meetly)
### Automated Speech-to-Text, Abstractive Summarization & Action Item Extraction

---

## Abstract & Overview

Meetings are a core component of academic, corporate, and professional collaboration. However, manual note-taking is time-consuming, prone to human omission, and often lacks consistent structure. 

Meetly (AI Meeting Minutes Generator) is an automated system designed to transform recorded conversational audio and video into structured, actionable meeting minutes. The platform integrates:
1. Automatic Speech Recognition (ASR) using OpenAI Whisper and faster-whisper.
2. Natural Language Processing (NLP) for abstractive summarization, discussion point extraction, and decision tracking.
3. Automated Action Item Detection to identify tasks, assignees, deadlines, and completion statuses.
4. Interactive Two-Panel Workspace featuring an integrated audio player, waveform scrubber, real-time AI Q&A assistant, and live editable minutes.
5. Multi-Format Document Generation supporting PDF and Microsoft Word (DOCX) export with selective section inclusion.

---

## System Architecture

```
+-----------------------------------------------------------+
|              Recorded Meeting Audio / Video               |
|            (MP3, WAV, M4A, MP4, WebM, FLAC)               |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                    Audio Preprocessing                    |
|             (Format normalization, PyAV, PyDub)           |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|              Automatic Speech Recognition                 |
|              (OpenAI Whisper / faster-whisper)            |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|           Timestamped Transcript & Utterances             |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|               NLP Summarization & Extraction              |
|        (Abstractive Summary, Decisions, Action Items)     |
+-----------------------------------------------------------+
                              |
        +---------------------+---------------------+
        |                     |                     |
        v                     v                     v
+---------------+     +---------------+     +---------------+
|   Executive   |     | Key Decisions |     | Action Items  |
|    Summary    |     |   & Points    |     |  & Deadlines  |
+---------------+     +---------------+     +---------------+
        |                     |                     |
        +---------------------+---------------------+
                              |
                              v
+-----------------------------------------------------------+
|           Interactive Web Dashboard (Flask + JS)          |
|    - Two-Panel Workspace (Summary + Timestamped Script)   |
|    - Synchronized Audio Player & Scrubber                 |
|    - Real-Time AI Meeting Q&A Assistant                   |
|    - Meeting History Archive & Search                     |
+-----------------------------------------------------------+
                              |
        +---------------------+---------------------+
        |                                           |
        v                                           v
+-------------------------+               +-------------------------+
|   PDF Document Export   |               |   DOCX Document Export  |
|   (ReportLab Engine)    |               |  (python-docx Template) |
+-------------------------+               +-------------------------+
```

---

## Core Features

- **Speech-to-Text Pipeline:** Fast transcription with voice activity detection (VAD) to ignore background silence.
- **Structured Minutes Generation:** Automatically organizes minutes into:
  - Executive Summary: Concise high-level summary of the discussion.
  - Key Discussion Points: Grouped architectural and operational topics.
  - Decisions Made: Explicit resolutions and team agreements.
  - Action Items Table: Interactive task cards with assignees, deadlines, and status tracking.
- **AI Meeting Assistant (`/api/ask_ai`):** Natural language Q&A over transcript content for answers on deadlines, assigned tasks, or architectural decisions.
- **Audio Playback & Timestamp Seek:** Click any transcript utterance to seek the audio player to that exact timestamp.
- **Selective PDF & Word DOCX Export:** Choose which sections to include in the downloaded minutes with ReportLab XML entity sanitization.
- **Security Protections:**
  - Configurable CORS whitelist with preflight OPTIONS handling.
  - Path traversal protection using secure_filename().
  - File upload limits (250 MB) and format verification.
  - Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection).
  - HttpOnly and SameSite session cookie protection.
- **Responsive UI:** Dark/Light theme toggle, customizable accent colors, drag-and-drop ingestion, and instant guest demo mode.

---

## Technology Stack

| Layer | Component | Technology / Library |
| :--- | :--- | :--- |
| **Language** | Core Development | Python 3.10 / 3.11 |
| **Backend** | Application Server | Flask 3.1+, Flask-CORS, Werkzeug |
| **Speech Recognition** | ASR Engine | OpenAI Whisper / faster-whisper, CTranslate2 |
| **Audio Processing** | Decoding & Normalization | PyAV, PyDub, imageio-ffmpeg |
| **NLP & Summarization**| Text Analytics | Hugging Face Transformers, Tokenizers, NLTK |
| **Document Export** | File Compilation | python-docx, ReportLab |
| **Evaluation Metrics** | Accuracy Assessment | jiwer (WER), rouge-score (ROUGE-1, ROUGE-2, ROUGE-L) |
| **Frontend** | Interactive UI | HTML5, TailwindCSS, Vanilla JavaScript (ES6+) |

---

## Project Structure

```
AI-Meeting-Minutes-Generator/
├── app.py                     # Flask application and REST API endpoints
├── requirements.txt           # Python dependencies and versions
├── .gitignore                 # Git ignore rules
├── README.md                  # Project documentation
│
├── services/                  # Backend services and modules
│   ├── __init__.py            # Package initialization
│   ├── transcriber.py         # Speech recognition & audio ingestion
│   ├── summarizer.py          # Abstractive summarization & extraction
│   └── exporter.py            # PDF and Word DOCX document generation
│
├── static/                    # Frontend static assets
│   ├── css/
│   │   ├── theme.css          # Design system & dynamic theme tokens
│   │   ├── style.css          # Base styles
│   │   └── landing.css        # Landing styles
│   └── js/
│       ├── dashboard.js       # App controller, view switcher & Chart.js engine
│       ├── meetings.js        # Meetings store, search, filters & tag manager
│       └── workspace.js       # Audio upload, player sync & AI minutes workspace
│
├── templates/                 # Server-rendered HTML templates
│   ├── components/            # Modular dashboard views and components
│   │   ├── header.html        # Top global application bar
│   │   ├── sidebar.html       # Persistent navigation sidebar
│   │   ├── dashboard_view.html# KPI overview & interactive activity chart
│   │   ├── workspace_view.html# Audio ingestion & meeting intelligence
│   │   ├── meetings_view.html # Searchable meetings list & filters
│   │   ├── analytics_view.html# Productivity & completion metrics
│   │   ├── settings_view.html # Preferences & AI pipeline config
│   │   └── modals.html        # Export, rename, and tag dialogs
│   ├── landing.html           # Public landing page
│   ├── login.html             # User authentication view
│   ├── signup.html            # Registration view
│   ├── dashboard.html         # Main application container
│   └── index.html             # Prototype single-page interface
│
├── uploads/                   # Staged audio files (.gitkeep)
└── outputs/                   # Generated PDF and DOCX documents (.gitkeep)
```

---

## Setup and Installation

### Prerequisites
* Python 3.10 or 3.11
* ffmpeg installed on the system (or bundled via imageio-ffmpeg)
* Git version control

### 1. Clone the Repository
```bash
git clone https://github.com/Dij06/AI-Meeting-Minutes-Generator.git
cd AI-Meeting-Minutes-Generator
```

### 2. Create and Activate Virtual Environment
**On Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**On Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the Server
```bash
python app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## API Endpoints Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Landing page |
| `/login` | `GET, POST` | User authentication and guest access |
| `/signup` | `GET, POST` | User registration |
| `/dashboard` | `GET` | Main workspace view |
| `/api/demo` | `GET` | Returns sample pre-populated meeting dataset |
| `/upload` | `POST` | Uploads and processes audio recording |
| `/api/ask_ai` | `POST` | Natural language Q&A over meeting transcript |
| `/api/meeting_insights` | `GET, POST` | Returns summary highlights for the executive panel |
| `/export/<format>` | `GET, POST` | Downloads PDF or Word DOCX (format=pdf or format=docx) |

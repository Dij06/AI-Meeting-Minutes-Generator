# AI Meeting Minutes Generator (Meetly)
### Automated Speech-to-Text, Abstractive Summarization & Action Item Extraction

[![Python 3.10+](https://img.shields.io/badge/python-3.10%20%7C%203.11-blue.svg)](https://www.python.org/downloads/)
[![Flask 3.0+](https://img.shields.io/badge/flask-3.1.3-green.svg)](https://flask.palletsprojects.com/)
[![Whisper ASR](https://img.shields.io/badge/ASR-OpenAI%20Whisper-orange.svg)](https://github.com/openai/whisper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Abstract & Overview

Meetings are a core component of academic, corporate, and professional collaboration. However, manual note-taking is time-consuming, prone to human omission, and often lacks consistent structure. 

**Meetly (AI Meeting Minutes Generator)** is an automated system designed to transform recorded conversational audio and video into structured, actionable meeting minutes. The platform integrates:
1. **Automatic Speech Recognition (ASR)** using OpenAI Whisper and faster-whisper.
2. **Natural Language Processing (NLP)** for abstractive summarization, discussion point extraction, and decision tracking.
3. **Automated Action Item Detection** to identify tasks, assignees, deadlines, and completion statuses.
4. **Interactive Two-Panel Workspace** featuring an integrated audio player, waveform scrubber, real-time AI Q&A assistant, and live editable minutes.
5. **Multi-Format Document Generation** supporting PDF and Microsoft Word (DOCX) export with selective section inclusion.

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
  - **Executive Summary:** Concise high-level summary of the discussion.
  - **Key Discussion Points:** Grouped architectural and operational topics.
  - **Decisions Made:** Explicit resolutions and team agreements.
  - **Action Items Table:** Interactive task cards with assignees, deadlines, and status tracking.
- **AI Meeting Assistant (`/api/ask_ai`):** Natural language Q&A over transcript content for answers on deadlines, assigned tasks, or architectural decisions.
- **Audio Playback & Timestamp Seek:** Click any transcript utterance to seek the audio player to that exact timestamp.
- **Selective PDF & Word DOCX Export:** Choose which sections to include in the downloaded minutes. Includes ReportLab XML entity sanitization.
- **Security Protections:**
  - Configurable CORS whitelist with preflight OPTIONS handling.
  - Path traversal protection using secure_filename().
  - File upload limits (250 MB) and format verification.
  - Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection).
  - HttpOnly and SameSite session cookie protection.
- **Modern Responsive UI:** Dark/Light theme toggle, customizable accent colors, drag-and-drop ingestion, and instant guest demo mode.

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
├── docs/                      # Technical documentation and guides
│   ├── final_phase_checklist.md
│   ├── frontend_architecture.md
│   └── viva_preparation_guide.md
│
├── services/                  # Backend services and modules
│   ├── __init__.py            # Package initialization
│   ├── transcriber.py         # Speech recognition & audio ingestion
│   ├── summarizer.py          # Abstractive summarization & extraction
│   └── exporter.py            # PDF and Word DOCX document generation
│
├── static/                    # Frontend static assets
│   ├── style.css              # Custom styling
│   ├── landing.css            # Landing page styling
│   └── script.js              # Client-side reactivity and API requests
│
├── templates/                 # Server-rendered HTML templates
│   ├── landing.html           # Landing page
│   ├── login.html             # User authentication view
│   ├── signup.html            # Registration view
│   ├── dashboard.html         # Main workspace dashboard
│   └── index.html             # Single-page interface
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

---

## Future Enhancements

1. **Speaker Diarization:** Identify and attribute transcript statements to individual speakers.
2. **Live Meeting Transcription:** WebRTC and WebSocket streaming for real-time in-meeting minutes generation.
3. **Task Integrations:** Direct export to Jira, Trello, Asana, Notion, and Slack.
4. **Multilingual Translation:** Automatic translation of non-English meetings into English executive summaries.

---

## License
This project is developed for academic and educational purposes under the **MIT License**.

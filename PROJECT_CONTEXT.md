# Meetly: AI Meeting Minutes Generator — Project Context & Progress Report

> **Branch**: `feature/frontend`  
> **Last Updated**: September 23, 2026  
> **Purpose**: Comprehensive technical documentation of the project architecture, features implemented, refactoring history, and academic defense guide.

---

## 1. Executive Summary

**Meetly** is an end-to-end AI Meeting Minutes Generator application that ingests recorded meetings (audio or video), transcribes spoken dialogue with timestamped accuracy, extracts executive summaries, agreed decisions, and action items, and exports professional reports (PDF and Word formats).

The platform features a modern, responsive web interface built on a modular, clean-architecture pattern designed for scalability, low maintenance overhead, and easy academic demonstration.

---

## 2. System Architecture & Tech Stack

```
AI-Meeting-Minutes-Generator/
├── Backend (Flask API)
│   ├── app.py                     # Application controller & REST endpoints
│   └── services/
│       ├── exporter.py            # PDF (ReportLab) & DOCX (python-docx) generation
│       ├── transcriber.py         # Whisper ASR integration (ready for model weights)
│       └── summarizer.py          # Abstractive NLP & Action Item extraction pipeline
│
├── Frontend (Modular Web Client)
│   ├── static/
│   │   ├── css/
│   │   │   ├── theme.css          # Design system, accent variables & toggle styles
│   │   │   ├── style.css          # Prototype utility styling (preserved)
│   │   │   └── landing.css        # Landing page styling (preserved)
│   │   └── js/
│   │       ├── dashboard.js       # App controller, view routing & Chart.js engine
│   │       ├── workspace.js       # Audio player, pipeline checklist & AI minutes
│   │       └── meetings.js        # Meeting storage, search, filter & tag engine
│   │
│   └── templates/
│       ├── components/            # Clean, modular component views
│       │   ├── header.html        # Sticky top navigation bar & profile
│       │   ├── sidebar.html       # Persistent navigation drawer
│       │   ├── dashboard_view.html# KPI overview & interactive activity chart
│       │   ├── workspace_view.html# Meeting audio ingestion & intelligence
│       │   ├── meetings_view.html # Searchable meeting history & filter pills
│       │   ├── analytics_view.html# Productivity & completion breakdown
│       │   ├── settings_view.html # User preferences & theme customization
│       │   └── modals.html        # Selective export, rename & tag dialogs
│       ├── dashboard.html         # Main dashboard layout wrapper
│       ├── landing.html           # Public marketing landing page
│       ├── login.html             # User authentication view
│       ├── signup.html            # Registration view
│       └── index.html             # Prototype single-page interface (preserved)
```

### Core Technologies
- **Backend Framework**: Python 3.10+ / Flask 3.0+ with Flask-CORS for secure cross-origin requests.
- **Document Exporting**: ReportLab (vector-quality PDF) and `python-docx` (structured Word documents).
- **Speech Recognition Engine**: `faster-whisper` (optimized CTranslate2 Whisper implementation for CPU & GPU).
- **Audio Processing**: `pydub`, `av`, `imageio-ffmpeg` for universal media format decoding (MP3, WAV, M4A, MP4, FLAC, WebM).
- **Styling & UI**: Tailwind CSS, Chart.js, Google Inter & JetBrains Mono typography, custom CSS variables for live multi-accent theming.

---

## 3. Work Completed Till Now

### A. Frontend Modularization & Refactoring
- **Separation of Concerns**: Decomposed a previously monolithic 3000-line script and monolithic template into a clean, maintainable architecture:
  - Templates decomposed into `templates/components/` with Jinja2 sub-views.
  - CSS organized into `static/css/` (`theme.css`, `landing.css`, `style.css`).
  - JavaScript separated into `static/js/` by domain responsibility:
    - **`dashboard.js`**: Core application controller, view routing, active state persistence, and interactive Chart.js visualizations.
    - **`workspace.js`**: Audio file upload, interactive 5-stage pipeline animation, audio playback synchronization, Ask AI, and selective document exports.
    - **`meetings.js`**: Local meeting store, multi-tag management, duration and date filtering, real-time search, and tag modal dialogs.

### B. UI/UX Polish & Design System Unification
1. **Interactive Charts**:
   - **Meeting Activity Chart**: Chart.js weekly distribution with custom tooltip rendering, animated data transitions, responsive canvas, and a decoupled data provider (`getMeetingActivityDemoData`).
   - **Action Items Status Breakdown**: Donut chart illustrating Completed, In Progress, and Pending tasks with live metrics.
2. **Unified Dropdown Design System**:
   - Replaced default browser `<select>` boxes across all views (Meetings filters, Upload language selector, Settings preferences) with neutral, rounded pill selectors (`bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800`).
   - Integrated sleek, custom SVG chevron arrows with `pointer-events-none`.
   - Dark/light option styling to prevent browser default color collisions on Windows/macOS.
3. **Modernized Toggle Switches**:
   - High-contrast track styling with subtle borders and smooth transitions.
   - Pure white circular knobs with soft drop shadows and zero border clipping.
   - Dynamic activation glow linked to the user-selected theme accent.
4. **Header & Navigation Simplification**:
   - Streamlined view titles: "Meetings Archive" &rarr; "Meetings", "Analytics & Productivity" &rarr; "Analytics", "Settings & Preferences" &rarr; "Settings".
   - Added a dedicated "Upload Meeting" button in the sticky left sidebar.
   - Resolved view alignment gap: removed container margins so every view aligns with pixel-perfect consistency against the top bar.
   - Fixed Upload Meeting scroll jump: clicking "Upload Meeting" keeps the page neatly pinned to the top without hiding the header navigation.

### C. Meeting Workspace & AI Intelligence
1. **Audio Ingestion & Player**:
   - Drag-and-drop file upload with support for all standard audio and video formats up to 250 MB.
   - Integrated audio playback bar with play/pause, time scrubbing, and active utterance highlighting.
2. **Minutes of Meeting Display**:
   - Executive Summary card with quick-copy functionality.
   - Key Discussion Points bulleted list.
   - Agreed Decisions section.
   - Action Items with interactive completion checkboxes and strikethrough states.
3. **Timestamped Transcript View**:
   - Utterance-level timestamps (`MM:SS`) without redundant speaker clutter.
   - Real-time text search inside the transcript with animated mark highlighting.
4. **Interactive AI Tools**:
   - **Ask AI Q&A Assistant**: Context-aware natural language question answering over meeting contents (`/api/ask_ai`).
   - **Meeting Insights**: Auto-generates key takeaways, project blockers, and team sentiment (`/api/meeting_insights`).

### D. Export Engine
- Modal-driven selective export allowing users to choose exactly which sections to include:
  - Overview / Executive Summary
  - Key Decisions
  - Action Items
  - Full Timestamped Transcript
- High-quality downloads generated on the server:
  - **PDF Export** via ReportLab with tables, styles, and headers.
  - **DOCX Export** via `python-docx` with structured formatting and metadata.

### E. Theme & Accent Customization
- Instant Dark / Light mode switching with zero flash on page load (stored in `localStorage`).
- 5 User-selectable accent palettes (Blue, Indigo, Purple, Emerald, Rose) that update buttons, rings, and avatars in real-time.

---

## 4. Academic Defense & Viva Guide (Where is What?)

If asked by an evaluator or instructor where specific features are implemented:

| Feature | Primary File(s) | Description |
| :--- | :--- | :--- |
| **View Navigation & Routing** | `static/js/dashboard.js` (`switchView`) | Controls tab switching, updates URL/localStorage state, and manages top bar titles. |
| **Activity & Donut Charts** | `static/js/dashboard.js` (`initMeetingActivityChart`) | Chart.js lifecycle management, dataset updates, custom tooltip styling. |
| **Audio Upload & Checklist** | `static/js/workspace.js` (`startPipelineBtn`) | Handles file drag-and-drop, simulates 5-stage progress checklist, triggers API. |
| **Transcript Player Sync** | `static/js/workspace.js` (`audioPreview.ontimeupdate`) | Tracks current playback second and highlights the corresponding transcript utterance. |
| **Selective PDF / Word Export** | `services/exporter.py` & `app.py` (`/export/pdf`, `/export/docx`) | Backend ReportLab and python-docx document rendering based on user checkboxes. |
| **Meetings Filter & Search** | `static/js/meetings.js` (`renderMeetingsList`) | In-memory filtering by keyword, date range, duration, and user-assigned tags. |
| **Theme & Accent Engine** | `templates/dashboard.html` (head script) & `static/css/theme.css` | Reads `localStorage`, applies `.dark` class, and sets CSS variables (`--theme-accent`). |
| **API Endpoints** | `app.py` | Routes for `/upload`, `/api/demo`, `/api/ask_ai`, `/api/meeting_insights`, `/export/*`. |

---

## 5. Quality Assurance & Verification Results

Prior to this check-in, the codebase underwent comprehensive end-to-end verification:

1. **Static Analysis & Syntax Check**:
   - Python: Both `app.py` and `services/exporter.py` compiled cleanly (`py_compile`) with **0 errors**.
   - JavaScript: All JS files (`dashboard.js`, `workspace.js`, `meetings.js`) passed `node --check` with **0 errors**.
2. **DOM ID Integrity Audit**:
   - Audited all 231 HTML element IDs across all templates against all JavaScript DOM selectors (`getElementById`).
   - Dead/unused selectors were removed. **100% of DOM lookups have matching template elements.**
3. **Virtual Environment Health**:
   - Executed `pip check` — **"No broken requirements found."**
4. **Endpoint Validation**:
   - All 9 HTTP routes tested via Flask test client (`/`, `/login`, `/signup`, `/dashboard`, `/api/demo`, `/api/ask_ai`, `/api/meeting_insights`, `/export/pdf`, `/export/docx`) returned **HTTP 200 OK**.
5. **Document Generation**:
   - Both PDF and DOCX exports verified dynamically in `outputs/`.

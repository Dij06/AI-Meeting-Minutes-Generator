# AI Meeting Minutes Generator - Mandatory Frontend Architecture & Flow

This document specifies the official and permanent user journey and architectural flow for the frontend application.

`
Landing Page
      ↓
Login / Signup
      ↓
Dashboard (Overview / Past Meetings)
      ↓
Upload Meeting
      ↓
Processing (Progress Stepper & Percentage 0% -> 100%)
      ↓
Meeting Details
   ├── AI Summary
   ├── Key Points
   ├── Decisions
   ├── Action Items (Table)
   └── Transcript (Search & Copy)
      ↓
Export PDF / DOCX
`

---

## 1. Landing Page (/)
* **Purpose:** Public-facing promotional and overview page.
* **Key Sections:**
  - Hero banner with value proposition and  Get Started CTA.
  - Core capabilities: Whisper ASR, AI Abstractive Summarization, Action Items Extraction, Document Export.
  - Three-step visual workflow explanation.
  - Navigation bar with direct links to Login / Signup and Dashboard.

---

## 2. Authentication (/login, /signup)
* **Purpose:** Secure access to personalized workspace.
* **Components:**
  - Login form (Email / Password).
  - Registration form (Full Name, Email, Password).
  - Continue as Guest / Demo Mode for instant project evaluation and grading.

---

## 3. User Dashboard (/dashboard)
* **Purpose:** Central workspace hub.
* **Components:**
  - User greeting and high-level usage metrics (Total meetings processed, total action items tracked).
  - + Upload New Meeting primary action button.
  - Recent Meetings archive list with quick-view and re-export links.

---

## 4. Upload & Processing Modal / View
* **Purpose:** File ingestion and live transcription pipeline.
* **Components:**
  - Drag-and-drop zone supporting .mp3, .wav, .m4a, .mp4.
  - Embedded audio preview player with waveform/controls.
  - Multi-stage progress stepper (15% Upload -> 40% ASR -> 70% NLP -> 90% Structuring -> 100% Done).

---

## 5. Meeting Details View
* **Purpose:** Interactive review of extracted meeting intelligence.
* **Components:**
  - Executive Summary (in-line editable).
  - Key Discussion Points (bullet list, in-line editable).
  - Decisions Log (in-line editable).
  - Structured Action Items Table (Task, Assignee, Deadline, Status Pill, + Add row, Delete row).
  - Full Synchronized Transcript (with text search and copy-to-clipboard).

---

## 6. Document Export Service
* **Purpose:** Standardized executive document compilation.
* **Components:**
  - Direct PDF download (reflecting live on-screen user edits).
  - Direct DOCX download (reflecting live on-screen user edits).
  - Copy all formatted minutes to clipboard.

---

## 7. Interactive Graphics & Theme Engine
* **Interactive Hero Pathway (`landing.html`):**
  - Relative coordinate container with 4 floating glassmorphic process cards.
  - Floating CSS keyframe animations with staggered timing.
  - Multi-strand 3D vector soundwave ribbon drawn with cubic Bézier SVG paths.
  - Directional SVG curved connector arrows with precision arrowheads.
  - Handwritten "Meet Smarter" doodle (`Caveat` font rotated -12° with custom SVG swoop underline).
* **Theme Switching Engine:**
  - Tailwind `darkMode: 'class'` architecture with zero-flicker pre-render `<head>` execution.
  - Persistent preference synchronization via `localStorage`.
  - Seamless toggle between Clean White SaaS aesthetic and Deep Navy Dark Mode.

---

## 8. Viva & Examination Defense Notes
* For comprehensive interview and viva questions, examiner answers, and technical breakdown, see:
  - **[Viva Preparation Guide](file:///d:/Major%20Project/AI-Meeting-Minutes-Generator/docs/viva_preparation_guide.md)**

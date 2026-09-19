# AI Meeting Minutes Generator Using Speech-to-Text and Summarization

An automated system designed to transcribe audio recordings of meetings, summarize key discussions, extract decisions and actionable items, and generate structured meeting documentation.

---

## Abstract

Meetings form an essential part of academic, corporate, and professional communication. However, conversations in meetings often contain extensive discussions, making manual note-taking and minutes generation time-consuming, prone to human error, and inconsistent.

This project implements an end-to-end automated system to transform recorded meeting audio into structured, concise, and actionable meeting minutes. The pipeline leverages Automatic Speech Recognition (ASR) via OpenAI Whisper, Natural Language Processing (NLP) summarization and information extraction models, an interactive web dashboard for user interaction, and document generation modules for PDF and DOCX export.

---

## Objectives

1. **Automatic Speech Recognition:** Convert spoken conversational audio recordings into accurate textual transcripts using Automatic Speech Recognition (Whisper).
2. **Text Summarization:** Generate abstractive and meaningful summaries from meeting transcripts using pretrained language models.
3. **Structured Information Extraction:** Identify and extract key discussion points, decisions made, and actionable items (including task descriptions, responsible assignees, and deadlines).
4. **Interactive Dashboard:** Provide an accessible web interface for uploading meeting audio, reviewing generated transcripts, editing structured minutes, and exporting documents.
5. **System Evaluation:** Evaluate transcription accuracy using Word Error Rate (WER) and summary quality using ROUGE metrics and human-in-the-loop review.

---

## System Architecture

```
+------------------------------------+
|  Recorded Meeting Audio / Video    |
+------------------------------------+
                  |
                  v
+------------------------------------+
|        Audio Preprocessing         |
|   (Format conversion, PyAV/PyDub)  |
+------------------------------------+
                  |
                  v
+------------------------------------+
|    Automatic Speech Recognition    |
|          (OpenAI Whisper)          |
+------------------------------------+
                  |
                  v
+------------------------------------+
|        Meeting Transcript          |
+------------------------------------+
                  |
                  v
+------------------------------------+
|   Text Processing & Segmentation   |
+------------------------------------+
                  |
                  v
+------------------------------------+
|   AI Summarization & Extraction    |
|   (Hugging Face Transformers / LLM)|
+------------------------------------+
                  |
         +--------+--------+
         |                 |
         v                 v
+------------------+ +-------------------------+
| Executive Summary| | Key Discussion Points   |
+------------------+ +-------------------------+
| Decisions Made   | | Action Items & Deadlines|
+------------------+ +-------------------------+
         |                 |
         +--------+--------+
                  |
                  v
+------------------------------------+
|     Structured Meeting Minutes     |
+------------------------------------+
                  |
         +--------+--------+
         |                 |
         v                 v
+------------------+ +-------------------------+
|  Web Dashboard   | |  Document Export        |
|  (User Review)   | |  (PDF / DOCX Generation)|
+------------------+ +-------------------------+
```

---

## Technology Stack

| Layer | Component | Technology / Library |
| :--- | :--- | :--- |
| **Language** | Core Development | Python 3.11 |
| **Web Framework** | Backend Application Server | Flask, Flask-CORS |
| **Speech Recognition** | ASR Model | OpenAI Whisper / faster-whisper |
| **Audio Processing** | Decoding and Conversion | PyAV, PyDub, imageio-ffmpeg |
| **Summarization & NLP** | Language Models | Hugging Face Transformers / Pretrained LLMs |
| **Document Export** | File Generation | python-docx, ReportLab |
| **Evaluation Metrics** | Performance Assessment | jiwer (WER), rouge-score (ROUGE-1, ROUGE-2, ROUGE-L) |
| **Frontend** | User Interface | HTML5, CSS3, JavaScript |

---

## Repository Structure

```
AI-Meeting-Minutes-Generator/
│
├── app.py                   # Main Flask application and server entry point
├── requirements.txt         # Project dependencies
├── .gitignore               # Ignored files, virtual environments, and media
├── README.md                # Project documentation
│
├── services/                # Backend services and AI modules
│   ├── __init__.py          # Module initialization
│   ├── transcriber.py       # Speech-to-text pipeline (Whisper ASR)
│   ├── summarizer.py        # Summarization and structured extraction
│   ├── exporter.py          # PDF and DOCX generation service
│   └── evaluator.py         # WER and ROUGE evaluation utilities
│
├── static/                  # Frontend static assets
│   ├── style.css            # Dashboard styling
│   └── script.js            # Client-side logic and API requests
│
├── templates/               # Flask HTML templates
│   └── index.html           # Main user dashboard
│
├── uploads/                 # Temporary directory for uploaded audio files
└── outputs/                 # Directory for generated PDF and DOCX documents
```

---

## Setup and Installation

### Prerequisites
* Python 3.10 or Python 3.11 installed
* Git version control installed

### Step 1: Clone the Repository
```bash
git clone https://github.com/Dij06/AI-Meeting-Minutes-Generator.git
cd AI-Meeting-Minutes-Generator
```

### Step 2: Create and Activate Virtual Environment
On Windows (PowerShell):
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```

On Linux or macOS:
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Required Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Run the Application
```bash
python app.py
```

The application will initialize the local development server at `http://127.0.0.1:5000/`.

---

## Modular Pipeline Overview

* **Speech-to-Text (`services/transcriber.py`):** Ingestion of audio, preprocessing, and Whisper transcription generation.
* **Summarization & Extraction (`services/summarizer.py`):** Processing raw transcripts, text segmentation, abstractive summarization, and key entity/action-item parsing.
* **Frontend & Export (`templates/`, `static/`, `services/exporter.py`):** Web dashboard, interactive minutes display, and automated PDF/DOCX compilation.

---

## Future Scope

1. **Speaker Diarization:** Incorporating speaker recognition to distinguish and attribute statements to individual meeting participants.
2. **Real-Time Processing:** Enabling live audio streaming and instantaneous summarization during active meetings.
3. **Retrieval-Augmented Generation (RAG):** Contextual retrieval from external corporate documents, previous minutes, and presentation slides.
4. **Third-Party Integration:** Direct synchronization with collaboration platforms such as Slack, Microsoft Teams, and Jira.

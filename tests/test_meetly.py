import os
import tempfile
import unittest
import json
from services.auth import (
    init_auth_db,
    hash_password,
    verify_password,
    create_user,
    authenticate_user,
    update_user_password,
    update_user_profile,
)
from services.summarizer import (
    generate_meeting_minutes,
    _split_sentences,
    _extract_decisions,
    _extract_action_items,
)
from services.meetings_db import (
    init_meetings_db,
    save_meeting,
    get_user_meetings,
    get_meeting_by_id,
    delete_meeting,
    purge_expired_meetings,
)
from services.exporter import generate_docx, generate_pdf
from app import app


class TestAuth(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_auth.db")
        init_auth_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_password_hashing(self):
        pw = "SecretPassword123!"
        hashed = hash_password(pw)
        self.assertIn("$", hashed)
        self.assertTrue(verify_password(pw, hashed))
        self.assertFalse(verify_password("WrongPassword", hashed))

    def test_user_lifecycle(self):
        ok, user = create_user(self.db_path, "Alice", "alice@example.com", "Password123")
        self.assertTrue(ok)
        self.assertEqual(user["email"], "alice@example.com")

        # Duplicate email check
        ok2, err = create_user(self.db_path, "Alice", "alice@example.com", "Password123")
        self.assertFalse(ok2)

        # Authenticate
        auth_ok, auth_user = authenticate_user(self.db_path, "alice@example.com", "Password123")
        self.assertTrue(auth_ok)
        self.assertEqual(auth_user["name"], "Alice")

        # Update profile
        prof_ok, prof_res = update_user_profile(self.db_path, "alice@example.com", "Alice Smith", "alice_smith@example.com")
        self.assertTrue(prof_ok)
        self.assertEqual(prof_res["name"], "Alice Smith")


class TestSummarizer(unittest.TestCase):
    def test_sentence_splitting(self):
        text = "Hello world! This is a test. Are we ready?"
        sents = _split_sentences(text)
        self.assertEqual(len(sents), 3)

    def test_minutes_generation(self):
        transcript = (
            "Good morning team. Today we decided to use PostgreSQL for production. "
            "Sarah will complete the frontend components by Friday. "
            "John needs to finish the backend API review by tomorrow. "
            "We agreed to launch next week."
        )
        minutes = generate_meeting_minutes(transcript)
        self.assertIn("summary", minutes)
        self.assertTrue(len(minutes["decisions"]) >= 1)
        self.assertTrue(len(minutes["action_items"]) >= 1)

        # Check action item structure
        item = minutes["action_items"][0]
        self.assertIn("task", item)
        self.assertIn("assignee", item)
        self.assertIn("deadline", item)
        self.assertIn("status", item)


class TestMeetingsDB(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_meetings.db")
        init_meetings_db(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_and_soft_delete_7_day_retention(self):
        m_id = save_meeting(self.db_path, "test@meetly.app", {
            "title": "Sprint Sync",
            "filename": "sync.mp3",
            "summary": "Meeting summary text.",
            "action_items": [{"task": "Task 1", "assignee": "Bob", "deadline": "Friday", "status": "Pending"}],
            "decisions": ["Approved plan"],
            "discussion_points": ["Review"],
            "utterances": []
        })
        self.assertIsInstance(m_id, int)

        active = get_user_meetings(self.db_path, "test@meetly.app")
        self.assertEqual(len(active), 1)

        # Soft delete with 7-day retention
        del_res = delete_meeting(self.db_path, "test@meetly.app", m_id, immediate=False)
        self.assertTrue(del_res["success"])
        self.assertTrue(del_res["soft_deleted"])
        self.assertIn("delete_scheduled_for", del_res)

        # Confirm hidden from active queries
        active_after = get_user_meetings(self.db_path, "test@meetly.app")
        self.assertEqual(len(active_after), 0)


class TestExporter(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data = {
            "title": "Architecture Sync",
            "filename": "architecture.mp3",
            "statistics": {"duration": "10m", "word_count": 100, "language": "English"},
            "summary": "Discussed system architecture.",
            "decisions": ["Adopt faster-whisper"],
            "action_items": [{"task": "Benchmarking", "assignee": "Alice", "deadline": "Friday", "status": "Pending"}],
            "utterances": [{"time": "00:00", "seconds": 0, "text": "Hello team."}],
            "transcript": "Hello team."
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_pdf_export(self):
        pdf_path = os.path.join(self.temp_dir.name, "test.pdf")
        generate_pdf(self.data, pdf_path)
        self.assertTrue(os.path.exists(pdf_path))
        self.assertGreater(os.path.getsize(pdf_path), 500)

    def test_docx_export(self):
        docx_path = os.path.join(self.temp_dir.name, "test.docx")
        generate_docx(self.data, docx_path)
        self.assertTrue(os.path.exists(docx_path))
        self.assertGreater(os.path.getsize(docx_path), 5000)


class TestFlaskAPI(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_landing_page(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Meetly", res.data)

    def test_api_demo(self):
        res = self.client.get("/api/demo?lang=english")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("summary", data["data"])

    def test_api_auth_config(self):
        res = self.client.get("/api/auth/config")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("supabase_url", data)

    def test_cors_headers(self):
        res = self.client.options(
            "/api/meetings",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000")
        self.assertEqual(res.headers.get("Access-Control-Allow-Credentials"), "true")

    def test_ask_ai_endpoint(self):
        meeting = {
            "action_items": [{"task": "Build UI", "assignee": "Alex", "deadline": "Monday", "status": "Pending"}],
            "decisions": ["Use Flask"],
            "discussion_points": ["Architecture"],
            "utterances": [{"time": "00:00", "seconds": 0, "text": "Let us finalize the architecture."}]
        }
        res = self.client.post("/api/ask_ai", json={
            "question": "What is the deadline for Alex?",
            "meeting_data": meeting
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("Monday", data["answer"])


if __name__ == "__main__":
    unittest.main()

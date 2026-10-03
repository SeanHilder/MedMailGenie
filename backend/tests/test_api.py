"""Exercise real routes and prompt parsing without an API key or network calls."""

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.email = {"subject": "Team meeting", "body": "Please bring the report."}

    def test_health_and_docs_work_without_gemini(self):
        with patch("app.gemini.get_model") as model:
            self.assertEqual(self.client.get("/").status_code, 200)
            self.assertEqual(self.client.get("/openapi.json").status_code, 200)
            model.assert_not_called()

    def test_email_endpoints_preserve_their_response_contracts(self):
        cases = [
            ("/summarize/email", "Bring the report.", "summary"),
            ("/draft/generate", "I will bring it.", "draft_reply"),
            ("/classify/priority", "High", "priority"),
            ("/classify/category", "Meeting Request", "category"),
        ]
        for path, generated, field in cases:
            with (
                self.subTest(path=path),
                patch("app.services.generate_text", return_value=generated) as generate,
            ):
                response = self.client.post(path, json=self.email)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {field: generated})
                self.assertIn(self.email["subject"], generate.call_args.args[0])
                self.assertIn(self.email["body"], generate.call_args.args[0])

    def test_thread_includes_every_message(self):
        with patch("app.services.generate_text", return_value="Agreed.") as generate:
            response = self.client.post(
                "/summarize/thread",
                json={
                    "messages": [{"body": "First message"}, {"body": "Second message"}]
                },
            )
            self.assertEqual(response.json(), {"summary": "Agreed."})
            prompt = generate.call_args.args[0]
            self.assertLess(
                prompt.index("First message"), prompt.index("Second message")
            )

    def test_draft_uses_selected_tone(self):
        with patch("app.services.generate_text", return_value="Thanks!") as generate:
            self.client.post("/draft/generate", json={**self.email, "tone": "friendly"})
            self.assertIn("friendly reply", generate.call_args.args[0])

    def test_tasks_accept_fenced_json_and_fill_missing_lists(self):
        with patch(
            "app.services.generate_text",
            return_value='```json\n{"tasks": ["Bring the report"]}\n```',
        ):
            response = self.client.post("/extract/tasks", json=self.email)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {
                    "tasks": ["Bring the report"],
                    "deadlines": [],
                    "meeting_times": [],
                    "calendar_events": [],
                },
            )

    def test_tasks_fall_back_on_invalid_json(self):
        with patch("app.services.generate_text", return_value="not JSON"):
            response = self.client.post("/extract/tasks", json=self.email)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(all(value == [] for value in response.json().values()))

    def test_empty_voice_input_does_not_call_gemini(self):
        with patch("app.services.generate_text") as generate:
            response = self.client.post("/voice/cleanup", json={"transcript": "  "})
            self.assertEqual(response.json(), {"cleaned_text": ""})
            generate.assert_not_called()

    def test_voice_cleanup_preserves_transcript_when_model_returns_empty(self):
        with patch("app.services.generate_text", return_value=""):
            response = self.client.post(
                "/voice/cleanup", json={"transcript": "  Hello  "}
            )
            self.assertEqual(response.json(), {"cleaned_text": "Hello"})

    def test_invalid_request_is_rejected_before_calling_gemini(self):
        with patch("app.services.generate_text") as generate:
            self.assertEqual(
                self.client.post("/summarize/email", json={}).status_code, 422
            )
            generate.assert_not_called()

    def test_provider_failure_returns_http_error(self):
        with patch(
            "app.services.generate_text", side_effect=RuntimeError("Unavailable")
        ):
            response = self.client.post("/summarize/email", json=self.email)
            self.assertEqual(response.status_code, 500)
            self.assertEqual(response.json(), {"detail": "Unavailable"})


if __name__ == "__main__":
    unittest.main()

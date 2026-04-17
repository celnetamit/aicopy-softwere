"""WSGI tests for the deployable Manuscript Editor web app."""

import io
import json
import unittest
from wsgiref.util import setup_testing_defaults

import webapp


class WsgiTestClient:
    def __init__(self, app, session_id=None):
        self.app = app
        self.cookies = {}
        self.session_id = session_id

    def request(self, method, path, payload=None):
        body = b""
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")

        environ = {}
        setup_testing_defaults(environ)
        environ["REQUEST_METHOD"] = method.upper()
        environ["PATH_INFO"] = path
        environ["CONTENT_LENGTH"] = str(len(body))
        environ["wsgi.input"] = io.BytesIO(body)
        if body:
            environ["CONTENT_TYPE"] = "application/json"
        if self.cookies:
            environ["HTTP_COOKIE"] = "; ".join(f"{key}={value}" for key, value in self.cookies.items())
        if self.session_id:
            environ["HTTP_X_MANUSCRIPT_SESSION"] = self.session_id

        meta = {}

        def start_response(status, headers, exc_info=None):
            meta["status"] = status
            meta["headers"] = headers

        result = self.app(environ, start_response)
        response_body = b"".join(result)
        if hasattr(result, "close"):
            result.close()

        for header_name, header_value in meta.get("headers", []):
            if header_name.lower() != "set-cookie":
                continue
            cookie_pair = header_value.split(";", 1)[0]
            cookie_name, cookie_value = cookie_pair.split("=", 1)
            self.cookies[cookie_name] = cookie_value

        text = response_body.decode("utf-8") if response_body else ""
        data = json.loads(text) if text else {}
        status_code = int(str(meta.get("status", "500")).split(" ", 1)[0])
        return status_code, data


class WebAppApiTests(unittest.TestCase):
    def setUp(self):
        webapp._SESSION_STORE.clear()
        self.client = WsgiTestClient(webapp.app)

    def test_load_process_and_export_round_trip(self):
        status, payload = self.client.request(
            "POST",
            "/api/load-text",
            {"file_name": "sample.txt", "content": "This are sample text."},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

        status, payload = self.client.request(
            "POST",
            "/api/process-document",
            {
                "options": {
                    "spelling": True,
                    "sentence_case": True,
                    "punctuation": True,
                    "chicago_style": True,
                    "ai": {"enabled": False},
                }
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["original"], "This are sample text.")
        self.assertTrue(payload["text"])

        status, payload = self.client.request("POST", "/api/export-file", {"file_type": "clean"})
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])
        self.assertIn("base64_data", payload)
        self.assertTrue(payload["file_name"].endswith("_clean.docx"))

    def test_sessions_are_isolated_between_clients(self):
        client_a = WsgiTestClient(webapp.app, session_id="client_a")
        client_b = WsgiTestClient(webapp.app, session_id="client_b")

        status, payload = client_a.request(
            "POST",
            "/api/load-text",
            {"file_name": "alpha.txt", "content": "Alpha text."},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

        status, payload = client_a.request(
            "POST",
            "/api/process-document",
            {
                "options": {
                    "spelling": True,
                    "sentence_case": True,
                    "punctuation": True,
                    "chicago_style": True,
                    "ai": {"enabled": False},
                }
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

        status, payload = client_b.request("POST", "/api/export-file", {"file_type": "clean"})
        self.assertEqual(status, 200)
        self.assertFalse(payload["success"])
        self.assertEqual(payload.get("error_code"), "EXPORT_NO_CORRECTED_DOC")

    def test_header_based_session_survives_without_cookie_round_trip(self):
        client = WsgiTestClient(webapp.app, session_id="sticky_header_session")

        status, payload = client.request(
            "POST",
            "/api/load-text",
            {"file_name": "sample.txt", "content": "This are sample text."},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

        client.cookies.clear()

        status, payload = client.request(
            "POST",
            "/api/process-document",
            {
                "options": {
                    "spelling": True,
                    "sentence_case": True,
                    "punctuation": True,
                    "chicago_style": True,
                    "ai": {"enabled": False},
                }
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])
        self.assertTrue(payload["text"])

    def test_reset_session_clears_loaded_state(self):
        status, payload = self.client.request(
            "POST",
            "/api/load-text",
            {"file_name": "sample.txt", "content": "Hello world."},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

        status, payload = self.client.request("POST", "/api/reset-session", {})
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

        status, payload = self.client.request("GET", "/api/redline-preview")
        self.assertEqual(status, 400)
        self.assertFalse(payload["success"])
        self.assertEqual(payload["error"], "No document loaded")


if __name__ == "__main__":
    unittest.main()

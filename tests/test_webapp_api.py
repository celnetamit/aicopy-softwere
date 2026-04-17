"""WSGI tests for authenticated Manuscript Editor web app."""

import io
import json
import os
import unittest
from urllib.parse import urlencode
from wsgiref.util import setup_testing_defaults


os.environ.setdefault("MANUSCRIPT_EDITOR_DEV_TEST_TOKENS", "1")
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/manuscript_editor_test.sqlite3")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")

import webapp  # noqa: E402


class WsgiTestClient:
    def __init__(self, app):
        self.app = app
        self.cookies = {}

    def request(self, method, path, payload=None, query=None):
        body = b""
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")

        environ = {}
        setup_testing_defaults(environ)
        environ["REQUEST_METHOD"] = method.upper()

        path_info = path
        query_string = ""
        if "?" in path:
            path_info, query_string = path.split("?", 1)
        if query:
            encoded = urlencode(query)
            query_string = f"{query_string}&{encoded}" if query_string else encoded

        environ["PATH_INFO"] = path_info
        environ["QUERY_STRING"] = query_string
        environ["CONTENT_LENGTH"] = str(len(body))
        environ["wsgi.input"] = io.BytesIO(body)

        if body:
            environ["CONTENT_TYPE"] = "application/json"

        if self.cookies:
            environ["HTTP_COOKIE"] = "; ".join(f"{key}={value}" for key, value in self.cookies.items())

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


class AuthenticatedWebAppApiTests(unittest.TestCase):
    def setUp(self):
        webapp._STORE.clear_all_for_tests()
        self.client = WsgiTestClient(webapp.app)

    def _login(self, email="user@conwiz.in"):
        status, payload = self.client.request(
            "POST",
            "/api/auth/google-login",
            {"id_token": f"test:{email}"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertIn("user", payload)
        return payload["user"]

    def test_blocked_domain_cannot_login(self):
        status, payload = self.client.request(
            "POST",
            "/api/auth/google-login",
            {"id_token": "test:blocked@example.com"},
        )
        self.assertEqual(status, 403)
        self.assertFalse(payload.get("success"))
        self.assertEqual(payload.get("error_code"), "AUTH_DOMAIN_BLOCKED")

    def test_auth_me_requires_login_then_succeeds(self):
        status, payload = self.client.request("GET", "/api/auth/me")
        self.assertEqual(status, 401)
        self.assertFalse(payload.get("success"))

        user = self._login("staff@conwiz.in")
        status, payload = self.client.request("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload["user"]["email"], "staff@conwiz.in")
        self.assertEqual(payload["user"]["role"], user["role"])

    def test_upload_process_and_download_round_trip(self):
        self._login("writer@conwiz.in")

        status, payload = self.client.request(
            "POST",
            "/api/tasks/upload-text",
            {"file_name": "sample.txt", "content": "This are sample text."},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        task_id = payload.get("task_id")
        self.assertTrue(task_id)

        status, payload = self.client.request(
            "POST",
            f"/api/tasks/{task_id}/process",
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
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("task_id"), task_id)

        status, payload = self.client.request("GET", f"/api/tasks/{task_id}/download", query={"type": "clean"})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertIn("base64_data", payload)

        status, payload = self.client.request("GET", "/api/tasks")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertGreaterEqual(len(payload.get("tasks", [])), 1)

    def test_task_access_isolated_between_users(self):
        owner = WsgiTestClient(webapp.app)
        other = WsgiTestClient(webapp.app)

        status, _ = owner.request("POST", "/api/auth/google-login", {"id_token": "test:owner@conwiz.in"})
        self.assertEqual(status, 200)

        status, payload = owner.request(
            "POST",
            "/api/tasks/upload-text",
            {"file_name": "alpha.txt", "content": "Alpha manuscript."},
        )
        self.assertEqual(status, 200)
        task_id = payload.get("task_id")

        status, _ = other.request("POST", "/api/auth/google-login", {"id_token": "test:other@conwiz.in"})
        self.assertEqual(status, 200)

        status, payload = other.request("GET", f"/api/tasks/{task_id}")
        self.assertEqual(status, 404)
        self.assertFalse(payload.get("success"))
        self.assertEqual(payload.get("error_code"), "TASK_NOT_FOUND")

    def test_admin_can_view_users_and_non_admin_cannot(self):
        # Non-admin user should be blocked from admin endpoints.
        self._login("member@conwiz.in")
        status, payload = self.client.request("GET", "/api/admin/users")
        self.assertEqual(status, 403)
        self.assertFalse(payload.get("success"))
        self.assertEqual(payload.get("error_code"), "FORBIDDEN")

        # Admin login should allow access.
        admin_client = WsgiTestClient(webapp.app)
        status, payload = admin_client.request(
            "POST",
            "/api/auth/google-login",
            {"id_token": "test:amit@conwiz.in"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))

        status, payload = admin_client.request("GET", "/api/admin/users")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertGreaterEqual(len(payload.get("users", [])), 1)

    def test_deactivated_user_cannot_access_api(self):
        admin_client = WsgiTestClient(webapp.app)
        user_client = WsgiTestClient(webapp.app)

        status, payload = admin_client.request("POST", "/api/auth/google-login", {"id_token": "test:amit@conwiz.in"})
        self.assertEqual(status, 200)

        status, payload = user_client.request("POST", "/api/auth/google-login", {"id_token": "test:reviewer@conwiz.in"})
        self.assertEqual(status, 200)
        user_id = payload["user"]["id"]

        status, payload = admin_client.request(
            "POST",
            f"/api/admin/users/{user_id}/status",
            {"status": "INACTIVE"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))

        status, payload = user_client.request("GET", "/api/tasks")
        self.assertIn(status, (401, 403))
        self.assertFalse(payload.get("success"))
        self.assertIn(payload.get("error_code"), {"AUTH_USER_INACTIVE", "AUTH_SESSION_INVALID"})


if __name__ == "__main__":
    unittest.main()

"""WSGI tests for authenticated Manuscript Editor web app."""

import base64
import io
import json
import math
import os
import tempfile
import unittest
import zipfile
from unittest.mock import Mock, patch
from urllib.parse import urlencode
from wsgiref.util import setup_testing_defaults

from docx import Document


os.environ.setdefault("MANUSCRIPT_EDITOR_DEV_TEST_TOKENS", "1")
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/manuscript_editor_test.sqlite3")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-google-client-id")

import webapp  # noqa: E402


class WsgiTestClient:
    def __init__(self, app):
        self.app = app
        self.cookies = {}

    def request(self, method, path, payload=None, query=None, headers=None):
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

        if headers:
            for raw_name, raw_value in headers.items():
                if raw_name is None or raw_value is None:
                    continue
                name = str(raw_name).strip()
                if not name:
                    continue
                key = name.upper().replace("-", "_")
                if key not in ("CONTENT_TYPE", "CONTENT_LENGTH") and not key.startswith("HTTP_"):
                    key = "HTTP_" + key
                environ[key] = str(raw_value)

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

    def request_text(self, method, path, payload=None, query=None, headers=None):
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

        if headers:
            for raw_name, raw_value in headers.items():
                if raw_name is None or raw_value is None:
                    continue
                name = str(raw_name).strip()
                if not name:
                    continue
                key = name.upper().replace("-", "_")
                if key not in ("CONTENT_TYPE", "CONTENT_LENGTH") and not key.startswith("HTTP_"):
                    key = "HTTP_" + key
                environ[key] = str(raw_value)

        meta = {}

        def start_response(status, headers, exc_info=None):
            meta["status"] = status
            meta["headers"] = headers

        result = self.app(environ, start_response)
        response_body = b"".join(result)
        if hasattr(result, "close"):
            result.close()

        status_code = int(str(meta.get("status", "500")).split(" ", 1)[0])
        text = response_body.decode("utf-8") if response_body else ""
        return status_code, text

    def request_bytes(self, method, path, payload=None, query=None, headers=None):
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

        if headers:
            for raw_name, raw_value in headers.items():
                if raw_name is None or raw_value is None:
                    continue
                name = str(raw_name).strip()
                if not name:
                    continue
                key = name.upper().replace("-", "_")
                if key not in ("CONTENT_TYPE", "CONTENT_LENGTH") and not key.startswith("HTTP_"):
                    key = "HTTP_" + key
                environ[key] = str(raw_value)

        meta = {}

        def start_response(status, headers, exc_info=None):
            meta["status"] = status
            meta["headers"] = headers

        result = self.app(environ, start_response)
        response_body = b"".join(result)
        if hasattr(result, "close"):
            result.close()

        status_code = int(str(meta.get("status", "500")).split(" ", 1)[0])
        headers_dict = {str(k).lower(): str(v) for k, v in meta.get("headers", [])}
        return status_code, response_body, headers_dict


class AuthenticatedWebAppApiTests(unittest.TestCase):
    def setUp(self):
        webapp._STORE.clear_all_for_tests()
        self.client = WsgiTestClient(webapp.app)
        self._old_local_login_enabled = webapp.ENABLE_LOCAL_MANUAL_LOGIN

    def tearDown(self):
        webapp.ENABLE_LOCAL_MANUAL_LOGIN = self._old_local_login_enabled

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

    def test_local_manual_login_disabled_by_default(self):
        status, payload = self.client.request(
            "POST",
            "/api/auth/local-login",
            {"username": "admin", "password": "password"},
        )
        self.assertEqual(status, 403)
        self.assertFalse(payload.get("success"))
        self.assertEqual(payload.get("error_code"), "AUTH_LOCAL_LOGIN_DISABLED")

    def test_local_manual_login_succeeds_when_enabled(self):
        webapp.ENABLE_LOCAL_MANUAL_LOGIN = True
        status, payload = self.client.request(
            "POST",
            "/api/auth/local-login",
            {"username": "admin", "password": "password"},
            headers={"X-Forwarded-For": "127.0.0.1"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload["user"]["role"], "ADMIN")

        status, payload = self.client.request("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload["user"]["role"], "ADMIN")

    def test_admin_dashboard_route_renders_admin_shell(self):
        status, html = self.client.request_text("GET", "/admin-dashboard")
        self.assertEqual(status, 200)
        self.assertIn('id="admin-panel-backdrop"', html)
        self.assertIn('admin-dashboard-active', html)
        self.assertIn('class="setup-wizard-backdrop" id="admin-panel-backdrop"', html)
        self.assertNotIn('class="setup-wizard-backdrop hidden" id="admin-panel-backdrop"', html)

    def test_json_response_sanitizes_non_finite_numbers(self):
        response = webapp._json_response({"value": math.nan, "nested": {"score": math.inf}})
        payload = json.loads(response.body)
        self.assertIsNone(payload["value"])
        self.assertIsNone(payload["nested"]["score"])

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
        exported_bytes = base64.b64decode(payload["base64_data"])
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as output_handle:
            output_path = output_handle.name
        try:
            with open(output_path, "wb") as outfile:
                outfile.write(exported_bytes)
            self.assertTrue(zipfile.is_zipfile(output_path))
            with zipfile.ZipFile(output_path) as archive:
                names = set(archive.namelist())
                self.assertIn("[Content_Types].xml", names)
                self.assertIn("word/document.xml", names)
                self.assertIn("word/_rels/document.xml.rels", names)
        finally:
            os.unlink(output_path)

        status, payload = self.client.request("GET", "/api/tasks")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertGreaterEqual(len(payload.get("tasks", [])), 1)

    def test_binary_download_endpoint_returns_valid_docx(self):
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

        status, body, headers = self.client.request_bytes(
            "GET",
            f"/api/tasks/{task_id}/download-file",
            query={"type": "clean"},
        )
        self.assertEqual(status, 200)
        self.assertIn(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers.get("content-type", ""),
        )
        self.assertIn("attachment;", headers.get("content-disposition", ""))

        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as output_handle:
            output_path = output_handle.name
        try:
            with open(output_path, "wb") as outfile:
                outfile.write(body)
            self.assertTrue(zipfile.is_zipfile(output_path))
            with zipfile.ZipFile(output_path) as archive:
                names = set(archive.namelist())
                self.assertIn("[Content_Types].xml", names)
                self.assertIn("word/document.xml", names)
                self.assertIn("word/_rels/document.xml.rels", names)
        finally:
            os.unlink(output_path)

    def test_legacy_export_file_uses_docx_template_when_base64_source_is_supplied(self):
        self._login("writer@conwiz.in")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as source_handle:
            source_path = source_handle.name

        try:
            doc = Document()
            doc.add_paragraph("Intro paragraph")
            table = doc.add_table(rows=1, cols=2)
            table.cell(0, 0).text = "A1"
            table.cell(0, 1).text = "B1"
            doc.add_paragraph("Closing paragraph")
            doc.save(source_path)

            with open(source_path, "rb") as infile:
                source_docx_base64 = base64.b64encode(infile.read()).decode("ascii")

            status, payload = self.client.request(
                "POST",
                "/api/export-file",
                {
                    "task_id": "",
                    "source_type": "docx",
                    "source_docx_base64": source_docx_base64,
                    "file_type": "clean",
                    "original_text": "Intro paragraph\nA1\tB1\nClosing paragraph",
                    "corrected_text": "Updated intro\nR1C1\tR1C2\nUpdated closing",
                    "file_name": "sample.docx",
                },
            )
            self.assertEqual(status, 200)
            self.assertTrue(payload.get("success"))
            self.assertIn("base64_data", payload)

            exported_bytes = base64.b64decode(payload["base64_data"])
            with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as output_handle:
                output_path = output_handle.name

            try:
                with open(output_path, "wb") as outfile:
                    outfile.write(exported_bytes)
                out_doc = Document(output_path)
                self.assertEqual(out_doc.paragraphs[0].text, "Updated intro")
                self.assertEqual(len(out_doc.tables), 1)
                self.assertEqual(out_doc.tables[0].cell(0, 0).text, "R1C1")
                self.assertEqual(out_doc.tables[0].cell(0, 1).text, "R1C2")
                self.assertEqual(out_doc.paragraphs[-1].text, "Updated closing")
            finally:
                os.unlink(output_path)
        finally:
            os.unlink(source_path)

    def test_legacy_process_document_can_create_and_process_docx_task_without_task_id(self):
        self._login("writer@conwiz.in")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as source_handle:
            source_path = source_handle.name

        try:
            doc = Document()
            doc.add_paragraph("Intro paragraph")
            table = doc.add_table(rows=1, cols=2)
            table.cell(0, 0).text = "A1"
            table.cell(0, 1).text = "B1"
            doc.add_paragraph("Closing paragraph")
            doc.save(source_path)

            with open(source_path, "rb") as infile:
                source_docx_base64 = base64.b64encode(infile.read()).decode("ascii")

            status, payload = self.client.request(
                "POST",
                "/api/process-document",
                {
                    "task_id": "",
                    "source_type": "docx",
                    "source_docx_base64": source_docx_base64,
                    "source_text": "Intro paragraph\nA1\tB1\nClosing paragraph",
                    "source_file_name": "sample.docx",
                    "options": {
                        "spelling": True,
                        "sentence_case": True,
                        "punctuation": True,
                        "chicago_style": True,
                        "ai": {"enabled": False},
                    },
                },
            )
            self.assertEqual(status, 200)
            self.assertTrue(payload.get("success"))
            task_id = payload.get("task_id")
            self.assertTrue(task_id)

            status, task_payload = self.client.request("GET", f"/api/tasks/{task_id}")
            self.assertEqual(status, 200)
            self.assertTrue(task_payload.get("success"))
            task = task_payload.get("task") or {}
            self.assertEqual(task.get("status"), "PROCESSED")
            self.assertTrue(str(task.get("corrected_text") or "").strip())
            self.assertTrue(task.get("downloads", {}).get("clean"))
            self.assertTrue(task.get("downloads", {}).get("highlighted"))
        finally:
            os.unlink(source_path)

    def test_upload_succeeds_when_bridge_header_is_present(self):
        self._login("bridge@conwiz.in")
        status, payload = self.client.request(
            "POST",
            "/api/tasks/upload-text",
            {"file_name": "sample.txt", "content": "Bridge header upload should work."},
            headers={"X-Manuscript-Session": "browser-fallback-session-id"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertTrue(payload.get("task_id"))

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

    def test_admin_can_validate_ai_provider(self):
        admin_client = WsgiTestClient(webapp.app)
        status, payload = admin_client.request(
            "POST",
            "/api/auth/google-login",
            {"id_token": "test:amit@conwiz.in"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))

        status, payload = admin_client.request(
            "POST",
            "/api/admin/validate-ai-provider",
            {"provider": "unsupported-provider"},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertFalse(payload.get("valid"))
        self.assertIn("Unsupported provider", str(payload.get("message", "")))

    def test_admin_global_settings_round_trip(self):
        admin_client = WsgiTestClient(webapp.app)
        status, payload = admin_client.request("POST", "/api/auth/google-login", {"id_token": "test:amit@conwiz.in"})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))

        status, payload = admin_client.request("GET", "/api/admin/global-settings")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertIn("settings", payload)

        updated = {
            "editing": {
                "spelling": True,
                "sentence_case": True,
                "punctuation": True,
                "chicago_style": True,
                "cmos_strict_mode": True,
                "domain_profile": "medical",
                "custom_terms": ["myocardial infarction", "HbA1c"],
            },
            "ai": {
                "enabled": True,
                "provider": "agent_router",
                "model": "gpt-5",
                "ollama_host": "http://localhost:11434",
                "gemini_api_key": "gem-key",
                "openrouter_api_key": "or-key",
                "agent_router_api_key": "ar-key",
                "section_wise": True,
                "section_threshold_chars": 14000,
                "section_threshold_paragraphs": 100,
                "section_chunk_chars": 6000,
                "section_chunk_lines": 32,
                "global_consistency_max_chars": 19000,
            },
        }
        status, payload = admin_client.request("POST", "/api/admin/global-settings", {"settings": updated})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertEqual(payload.get("settings", {}).get("editing", {}).get("domain_profile"), "medical")

        user_client = WsgiTestClient(webapp.app)
        status, payload = user_client.request("POST", "/api/auth/google-login", {"id_token": "test:user@conwiz.in"})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        status, payload = user_client.request("GET", "/api/settings/runtime")
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        user_settings = payload.get("settings", {})
        self.assertEqual(user_settings.get("editing", {}).get("domain_profile"), "medical")
        self.assertEqual(user_settings.get("ai", {}).get("openrouter_api_key", ""), "")
        self.assertEqual(user_settings.get("ai", {}).get("agent_router_api_key", ""), "")

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

    @patch("webapp.requests.post")
    def test_admin_validate_ai_provider_uses_saved_global_key_when_input_blank(self, mock_post):
        admin_client = WsgiTestClient(webapp.app)
        status, payload = admin_client.request("POST", "/api/auth/google-login", {"id_token": "test:amit@conwiz.in"})
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))

        status, payload = admin_client.request(
            "POST",
            "/api/admin/global-settings",
            {
                "settings": {
                    "editing": {},
                    "ai": {
                        "provider": "agent_router",
                        "model": "gpt-5",
                        "agent_router_api_key": "saved-agent-token",
                    },
                }
            },
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))

        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"choices": [{"message": {"content": "OK"}}]}
        mock_post.return_value = mock_response

        status, payload = admin_client.request(
            "POST",
            "/api/admin/validate-ai-provider",
            {"provider": "agent_router", "model": "", "api_key": "", "ollama_host": ""},
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload.get("success"))
        self.assertTrue(payload.get("valid"))

        _, kwargs = mock_post.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer saved-agent-token")
        self.assertEqual(kwargs["json"]["model"], "gpt-5")

    @patch("webapp.requests.get")
    def test_validate_ai_provider_runtime_checks_ollama_model_presence(self, mock_get):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.content = b'{"models":[{"name":"llama3.1:latest"}]}'
        mock_response.json.return_value = {"models": [{"name": "llama3.1:latest"}]}
        mock_get.return_value = mock_response

        ok, message = webapp._validate_ai_provider_runtime("ollama", "missing-model", "", "http://localhost:11434")
        self.assertFalse(ok)
        self.assertIn("not installed", message)

        ok, message = webapp._validate_ai_provider_runtime("ollama", "llama3.1:latest", "", "http://localhost:11434")
        self.assertTrue(ok)
        self.assertIn("with model llama3.1:latest", message)


if __name__ == "__main__":
    unittest.main()

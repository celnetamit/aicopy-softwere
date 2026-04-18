#!/usr/bin/env python3
"""Deployable WSGI web application for Manuscript Editor."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import tempfile
import threading
import time
import traceback
import uuid
import requests
from functools import wraps
from typing import Dict, Optional, Tuple

from bottle import Bottle, HTTPResponse, request, response, run, static_file

from app_store import AppStore, ROLE_ADMIN, STATUS_ACTIVE, STATUS_INACTIVE, SessionContext
from document_processor import DocumentProcessor


try:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token
except Exception:  # pragma: no cover - optional import if auth deps missing
    google_requests = None
    google_id_token = None


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT_DIR, "web")
REQUIRED_WEB_ASSETS = ("index.html", "style.css", "app.js", "eel_web_bridge.js")

SESSION_COOKIE_NAME = "manuscript_editor_sid"
SESSION_COOKIE_ALT_NAME = "manuscript_editor_sid_v2"
SESSION_COOKIE_ENV_KEY = "manuscript_editor.session_id"
SESSION_HEADER_NAME = "HTTP_X_MANUSCRIPT_SESSION"

DEFAULT_ALLOWED_DOMAINS = [
    "celnet.in",
    "conwiz.in",
    "stmjournals.in",
    "stmjournals.com",
    "nanoschool.in",
    "nstc.in",
]
DEFAULT_ADMIN_EMAILS = [
    "amit@conwiz.in",
    "puneet.mehrotra@celnet.in",
]

MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
APP_SETTING_KEY_GLOBAL_RUNTIME = "global_runtime_settings"


def _parse_csv_env(key: str, default_values):
    raw = str(os.getenv(key, "") or "").strip()
    if not raw:
        return [str(value).strip().lower() for value in default_values if str(value).strip()]
    values = []
    for piece in raw.split(","):
        candidate = str(piece or "").strip().lower()
        if candidate:
            values.append(candidate)
    return values


def _env_int(key: str, default_value: int, min_value: int, max_value: int) -> int:
    raw = str(os.getenv(key, "") or "").strip()
    if not raw:
        return default_value
    try:
        parsed = int(raw)
    except Exception:
        return default_value
    return max(min_value, min(max_value, parsed))


GOOGLE_CLIENT_ID = str(os.getenv("GOOGLE_CLIENT_ID", "") or "").strip()
ALLOWED_EMAIL_DOMAINS = sorted(set(_parse_csv_env("ALLOWED_EMAIL_DOMAINS", DEFAULT_ALLOWED_DOMAINS)))
ADMIN_EMAILS = sorted(set(_parse_csv_env("ADMIN_EMAILS", DEFAULT_ADMIN_EMAILS)))
SESSION_TTL_HOURS = _env_int("SESSION_TTL_HOURS", 12, 1, 168)
FILE_RETENTION_DAYS = _env_int("FILE_RETENTION_DAYS", 30, 1, 3650)
DATA_DIR = os.path.abspath(str(os.getenv("DATA_DIR", os.path.join(ROOT_DIR, "data")) or os.path.join(ROOT_DIR, "data")))
DATABASE_URL = str(os.getenv("DATABASE_URL", "") or "").strip()
ENABLE_DEV_TEST_TOKENS = str(os.getenv("MANUSCRIPT_EDITOR_DEV_TEST_TOKENS", "0") or "0").strip() in (
    "1",
    "true",
    "yes",
)


os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(os.path.join(DATA_DIR, "tasks"), exist_ok=True)

_STORE = AppStore(database_url=DATABASE_URL, data_dir=DATA_DIR)
_STORE.bootstrap_admin_roles(ADMIN_EMAILS)

_CLEANUP_LOCK = threading.Lock()
_LAST_CLEANUP_AT = 0.0

_RUNTIME_TELEMETRY_LOCK = threading.Lock()
_RUNTIME_TELEMETRY: Dict[str, Dict] = {}


app = Bottle()


def _default_runtime_telemetry() -> Dict:
    return {
        "export_attempts": 0,
        "export_successes": 0,
        "export_failures": 0,
        "save_attempts": 0,
        "save_successes": 0,
        "save_failures": 0,
        "save_fallback_used": 0,
        "errors_by_code": {},
    }


def _ensure_web_assets():
    missing = [name for name in REQUIRED_WEB_ASSETS if not os.path.isfile(os.path.join(WEB_DIR, name))]
    if missing:
        raise FileNotFoundError(f"Missing web assets in {WEB_DIR}: {', '.join(missing)}")


def _normalize_session_id(raw_value: str) -> str:
    candidate = str(raw_value or "").strip()
    if not candidate:
        return ""
    safe = []
    for char in candidate:
        if char.isalnum() or char in ("-", "_"):
            safe.append(char)
    return "".join(safe)[:128]


def _is_https_request() -> bool:
    forwarded = str(request.get_header("X-Forwarded-Proto", "") or "").strip().lower()
    if forwarded in ("https", "wss"):
        return True
    try:
        if request.urlparts and str(request.urlparts.scheme).lower() == "https":
            return True
    except Exception:
        return False
    return False


def _json_response(payload: Dict, status: int = 200, session_id: str = "", clear_session: bool = False) -> HTTPResponse:
    http_response = HTTPResponse(
        status=status,
        body=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )

    if session_id:
        http_response.set_cookie(
            SESSION_COOKIE_NAME,
            session_id,
            path="/",
            httponly=True,
            samesite="Lax",
            secure=_is_https_request(),
            max_age=SESSION_TTL_HOURS * 3600,
        )

    if clear_session:
        http_response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        http_response.delete_cookie(SESSION_COOKIE_ALT_NAME, path="/")

    return http_response


def _read_json_payload() -> Dict:
    raw_body = request.body.read()
    if not raw_body:
        return {}
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _get_client_ip() -> str:
    forwarded = str(request.get_header("X-Forwarded-For", "") or "").strip()
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:128]
    return str(request.environ.get("REMOTE_ADDR", "") or "").strip()[:128]


def _get_user_agent() -> str:
    return str(request.get_header("User-Agent", "") or "").strip()[:512]


def _read_cookie_value_from_header(cookie_name: str) -> str:
    raw_cookie = str(request.environ.get("HTTP_COOKIE", "") or "")
    if not raw_cookie:
        return ""
    target = str(cookie_name or "").strip()
    if not target:
        return ""
    last_value = ""
    for piece in raw_cookie.split(";"):
        token = piece.strip()
        if not token or "=" not in token:
            continue
        key, value = token.split("=", 1)
        if key.strip() == target:
            last_value = value.strip()
    return _normalize_session_id(last_value)


def _get_session_id_from_request() -> str:
    header_sid = _normalize_session_id(request.environ.get(SESSION_HEADER_NAME, ""))
    # Prefer raw Cookie header parsing so duplicate-cookie edge cases pick the most recent value.
    cookie_sid = _read_cookie_value_from_header(SESSION_COOKIE_NAME) or _normalize_session_id(
        request.get_cookie(SESSION_COOKIE_NAME) or ""
    )
    alt_cookie_sid = _read_cookie_value_from_header(SESSION_COOKIE_ALT_NAME) or _normalize_session_id(
        request.get_cookie(SESSION_COOKIE_ALT_NAME) or ""
    )
    # Prefer canonical cookie, then alternate cookie, then header fallback.
    return cookie_sid or alt_cookie_sid or header_sid


def _auth_context_from_request() -> Optional[SessionContext]:
    return request.environ.get("manuscript_editor.auth")


def _public_user_payload(context: SessionContext) -> Dict:
    return {
        "id": context.user_id,
        "email": context.email,
        "display_name": context.display_name,
        "role": context.role,
        "status": context.status,
    }


def _record_audit(
    *,
    event_type: str,
    actor_user_id: str = "",
    target_user_id: str = "",
    entity_type: str = "",
    entity_id: str = "",
    metadata: Optional[Dict] = None,
):
    try:
        _STORE.record_audit_event(
            event_type=event_type,
            actor_user_id=actor_user_id,
            target_user_id=target_user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata=metadata or {},
            ip_address=_get_client_ip(),
            user_agent=_get_user_agent(),
        )
    except Exception:
        # Audit failures should not block user flow.
        pass


def _error_payload(code: str, message: str, **extra) -> Dict:
    payload = {"success": False, "error": message, "error_code": code}
    payload.update(extra)
    return payload


def _default_global_runtime_settings() -> Dict:
    return {
        "editing": {
            "spelling": True,
            "sentence_case": True,
            "punctuation": True,
            "chicago_style": True,
            "cmos_strict_mode": True,
            "domain_profile": "auto",
            "custom_terms": [],
        },
        "ai": {
            "enabled": True,
            "provider": "ollama",
            "model": "llama3.1",
            "ollama_host": "http://localhost:11434",
            "gemini_api_key": "",
            "openrouter_api_key": "",
            "section_wise": True,
            "section_threshold_chars": 12000,
            "section_threshold_paragraphs": 90,
            "section_chunk_chars": 5500,
            "section_chunk_lines": 28,
            "global_consistency_max_chars": 18000,
        },
    }


def _normalize_custom_terms(raw_value) -> list:
    if isinstance(raw_value, str):
        pieces = re.split(r"[\n,;]+", raw_value)
    elif isinstance(raw_value, (list, tuple)):
        pieces = list(raw_value)
    else:
        pieces = []
    seen = set()
    out = []
    for piece in pieces:
        token = str(piece or "").strip()
        if not token:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(token[:120])
        if len(out) >= 500:
            break
    return out


def _normalize_global_runtime_settings(raw_value) -> Dict:
    defaults = _default_global_runtime_settings()
    raw = raw_value if isinstance(raw_value, dict) else {}
    editing_in = raw.get("editing", {}) if isinstance(raw.get("editing"), dict) else {}
    ai_in = raw.get("ai", {}) if isinstance(raw.get("ai"), dict) else {}

    def _bool(src: Dict, key: str, fallback: bool) -> bool:
        return bool(src.get(key, fallback))

    def _int(src: Dict, key: str, fallback: int, min_value: int, max_value: int) -> int:
        try:
            parsed = int(src.get(key, fallback))
        except Exception:
            parsed = int(fallback)
        return max(min_value, min(max_value, parsed))

    domain = str(editing_in.get("domain_profile", defaults["editing"]["domain_profile"]) or "auto").strip().lower()
    if domain not in ("auto", "general", "medical", "engineering", "law"):
        domain = "auto"

    provider = str(ai_in.get("provider", defaults["ai"]["provider"]) or "ollama").strip().lower()
    if provider not in ("ollama", "gemini", "openrouter", "agent_router"):
        provider = "ollama"

    return {
        "editing": {
            "spelling": _bool(editing_in, "spelling", defaults["editing"]["spelling"]),
            "sentence_case": _bool(editing_in, "sentence_case", defaults["editing"]["sentence_case"]),
            "punctuation": _bool(editing_in, "punctuation", defaults["editing"]["punctuation"]),
            "chicago_style": _bool(editing_in, "chicago_style", defaults["editing"]["chicago_style"]),
            "cmos_strict_mode": _bool(editing_in, "cmos_strict_mode", defaults["editing"]["cmos_strict_mode"]),
            "domain_profile": domain,
            "custom_terms": _normalize_custom_terms(editing_in.get("custom_terms", defaults["editing"]["custom_terms"])),
        },
        "ai": {
            "enabled": _bool(ai_in, "enabled", defaults["ai"]["enabled"]),
            "provider": provider,
            "model": str(ai_in.get("model", defaults["ai"]["model"]) or defaults["ai"]["model"]).strip()[:120],
            "ollama_host": str(ai_in.get("ollama_host", defaults["ai"]["ollama_host"]) or defaults["ai"]["ollama_host"]).strip()[:300],
            "gemini_api_key": str(ai_in.get("gemini_api_key", defaults["ai"]["gemini_api_key"]) or "").strip(),
            "openrouter_api_key": str(ai_in.get("openrouter_api_key", defaults["ai"]["openrouter_api_key"]) or "").strip(),
            "section_wise": _bool(ai_in, "section_wise", defaults["ai"]["section_wise"]),
            "section_threshold_chars": _int(ai_in, "section_threshold_chars", defaults["ai"]["section_threshold_chars"], 4000, 120000),
            "section_threshold_paragraphs": _int(ai_in, "section_threshold_paragraphs", defaults["ai"]["section_threshold_paragraphs"], 20, 1000),
            "section_chunk_chars": _int(ai_in, "section_chunk_chars", defaults["ai"]["section_chunk_chars"], 1800, 30000),
            "section_chunk_lines": _int(ai_in, "section_chunk_lines", defaults["ai"]["section_chunk_lines"], 8, 200),
            "global_consistency_max_chars": _int(
                ai_in,
                "global_consistency_max_chars",
                defaults["ai"]["global_consistency_max_chars"],
                6000,
                120000,
            ),
        },
    }


def _read_global_runtime_settings() -> Dict:
    row = _STORE.get_app_setting(APP_SETTING_KEY_GLOBAL_RUNTIME)
    if row and isinstance(row.get("value"), dict):
        return _normalize_global_runtime_settings(row.get("value"))
    return _default_global_runtime_settings()


def _global_runtime_settings_for_user_payload(settings: Dict) -> Dict:
    safe = _normalize_global_runtime_settings(settings)
    # Do not expose server API keys to non-admin users.
    safe["ai"]["gemini_api_key"] = ""
    safe["ai"]["openrouter_api_key"] = ""
    return safe


def _apply_global_runtime_settings(request_options: Dict, runtime_settings: Dict) -> Dict:
    opts = dict(request_options or {})
    settings = _normalize_global_runtime_settings(runtime_settings or {})
    editing = settings.get("editing", {})
    ai = settings.get("ai", {})
    opts["spelling"] = bool(editing.get("spelling", True))
    opts["sentence_case"] = bool(editing.get("sentence_case", True))
    opts["punctuation"] = bool(editing.get("punctuation", True))
    opts["chicago_style"] = bool(editing.get("chicago_style", True))
    opts["cmos_strict_mode"] = bool(editing.get("cmos_strict_mode", True))
    opts["domain_profile"] = str(editing.get("domain_profile", "auto"))
    opts["custom_terms"] = list(editing.get("custom_terms", []))
    opts["journal_profile"] = "vancouver_periods"
    opts["reference_profile"] = "vancouver_periods"
    opts["ai"] = {
        "enabled": bool(ai.get("enabled", True)),
        "provider": str(ai.get("provider", "ollama")),
        "model": str(ai.get("model", "")),
        "ollama_host": str(ai.get("ollama_host", "")),
        "api_key": str(ai.get("gemini_api_key", "")),
        "gemini_api_key": str(ai.get("gemini_api_key", "")),
        "openrouter_api_key": str(ai.get("openrouter_api_key", "")),
        "section_wise": bool(ai.get("section_wise", True)),
        "section_threshold_chars": int(ai.get("section_threshold_chars", 12000)),
        "section_threshold_paragraphs": int(ai.get("section_threshold_paragraphs", 90)),
        "section_chunk_chars": int(ai.get("section_chunk_chars", 5500)),
        "section_chunk_lines": int(ai.get("section_chunk_lines", 28)),
        "global_consistency_max_chars": int(ai.get("global_consistency_max_chars", 18000)),
    }
    return opts


def _increment_runtime_counter(session_id: str, key: str, code: str = ""):
    sid = _normalize_session_id(session_id)
    if not sid:
        return
    with _RUNTIME_TELEMETRY_LOCK:
        telemetry = _RUNTIME_TELEMETRY.get(sid)
        if telemetry is None:
            telemetry = _default_runtime_telemetry()
            _RUNTIME_TELEMETRY[sid] = telemetry
        telemetry[key] = int(telemetry.get(key, 0)) + 1
        if code:
            bucket = telemetry.setdefault("errors_by_code", {})
            bucket[code] = int(bucket.get(code, 0)) + 1


def _read_runtime_telemetry(session_id: str) -> Dict:
    sid = _normalize_session_id(session_id)
    if not sid:
        return _default_runtime_telemetry()
    with _RUNTIME_TELEMETRY_LOCK:
        telemetry = _RUNTIME_TELEMETRY.get(sid)
        if telemetry is None:
            telemetry = _default_runtime_telemetry()
            _RUNTIME_TELEMETRY[sid] = telemetry
        return dict(telemetry)


def _reset_runtime_telemetry(session_id: str):
    sid = _normalize_session_id(session_id)
    if not sid:
        return
    with _RUNTIME_TELEMETRY_LOCK:
        _RUNTIME_TELEMETRY[sid] = _default_runtime_telemetry()


def _verify_google_token(raw_id_token: str) -> Dict:
    token = str(raw_id_token or "").strip()
    if not token:
        raise ValueError("Missing Google ID token")

    if ENABLE_DEV_TEST_TOKENS and token.startswith("test:"):
        email = str(token.split(":", 1)[1] or "").strip().lower()
        if "@" not in email:
            raise ValueError("Invalid test token email")
        domain = email.rsplit("@", 1)[-1]
        return {
            "sub": "test_" + hashlib.sha256(email.encode("utf-8")).hexdigest()[:24],
            "email": email,
            "email_verified": True,
            "name": email.split("@", 1)[0],
            "hd": domain,
        }

    if not GOOGLE_CLIENT_ID:
        raise RuntimeError("GOOGLE_CLIENT_ID is not configured")

    if google_id_token is None or google_requests is None:
        raise RuntimeError("google-auth package is required for Google login")

    verifier_request = google_requests.Request()
    token_info = google_id_token.verify_oauth2_token(token, verifier_request, GOOGLE_CLIENT_ID)
    if not isinstance(token_info, dict):
        raise RuntimeError("Invalid token verification response")
    return token_info


def _require_auth_context() -> Tuple[Optional[SessionContext], Optional[HTTPResponse]]:
    session_id = _get_session_id_from_request()
    if not session_id:
        return None, _json_response(_error_payload("AUTH_REQUIRED", "Authentication required"), status=401)

    context = _STORE.get_session_context(session_id)
    if context is None:
        return None, _json_response(
            _error_payload("AUTH_SESSION_INVALID", "Session expired or invalid"),
            status=401,
            clear_session=True,
        )

    if context.status != STATUS_ACTIVE:
        _STORE.revoke_session(session_id)
        return None, _json_response(
            _error_payload("AUTH_USER_INACTIVE", "User access is inactive"),
            status=403,
            clear_session=True,
        )

    request.environ["manuscript_editor.auth"] = context
    request.environ[SESSION_COOKIE_ENV_KEY] = context.session_id
    return context, None


def require_auth(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        context, response = _require_auth_context()
        if response is not None:
            return response
        _maybe_run_cleanup()
        return handler(*args, **kwargs)

    return wrapped


def require_admin(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        context, response = _require_auth_context()
        if response is not None:
            return response

        if context.role != ROLE_ADMIN:
            _record_audit(
                event_type="admin_access_denied",
                actor_user_id=context.user_id,
                entity_type="route",
                entity_id=str(request.path or ""),
            )
            return _json_response(_error_payload("FORBIDDEN", "Admin access required"), status=403)

        _maybe_run_cleanup()
        return handler(*args, **kwargs)

    return wrapped


def _safe_file_name(raw_name: str, fallback: str = "manuscript") -> str:
    name = str(raw_name or "").strip() or fallback
    name = os.path.basename(name)
    allowed = []
    for char in name:
        if char.isalnum() or char in (".", "-", "_", " "):
            allowed.append(char)
    cleaned = "".join(allowed).strip().strip(".")
    if not cleaned:
        cleaned = fallback
    if len(cleaned) > 180:
        root, ext = os.path.splitext(cleaned)
        cleaned = root[:150] + ext[:20]
    return cleaned


def _task_dir(task_id: str) -> str:
    safe_id = _normalize_session_id(task_id) or uuid.uuid4().hex
    path = os.path.join(DATA_DIR, "tasks", safe_id)
    os.makedirs(path, exist_ok=True)
    return path


def _to_storage_relative_path(abs_path: str) -> str:
    normalized = os.path.abspath(abs_path)
    if not normalized.startswith(DATA_DIR + os.sep) and normalized != DATA_DIR:
        raise ValueError("Invalid storage path")
    rel = os.path.relpath(normalized, DATA_DIR)
    return rel.replace("\\", "/")


def _resolve_storage_path(relative_path: str) -> str:
    rel = str(relative_path or "").strip().replace("\\", "/")
    target = os.path.abspath(os.path.join(DATA_DIR, rel))
    if not target.startswith(DATA_DIR + os.sep) and target != DATA_DIR:
        raise ValueError("Path escapes data dir")
    return target


def _build_download_filename(original_file_name: str, file_type: str) -> str:
    base_name = os.path.splitext(_safe_file_name(original_file_name or "manuscript"))[0] or "manuscript"
    prefix = "clean" if file_type == "clean" else "highlighted"
    return f"{prefix}_{base_name}.docx"


def _build_process_payload(processor: DocumentProcessor, task_row: Dict, corrected_text: str, full_corrected_text: str) -> Dict:
    original_text = str(task_row.get("original_text") or "")
    return {
        "success": True,
        "task_id": str(task_row.get("id") or ""),
        "text": corrected_text,
        "original": original_text,
        "full_corrected_text": full_corrected_text or corrected_text,
        "word_count": len(str(corrected_text or "").split()),
        "redline_html": processor.build_redline_html(original_text, corrected_text),
        "corrected_annotated_html": processor.build_foreign_annotated_html(corrected_text),
        "corrections_report": processor.build_corrections_report(original_text, corrected_text),
        "noun_report": processor.build_noun_report(corrected_text),
        "domain_report": processor.get_domain_report(),
        "journal_profile_report": processor.get_journal_profile_report(),
        "citation_reference_report": processor.get_citation_reference_report(),
        "processing_audit": processor.get_processing_audit(),
        "processing_note": getattr(processor, "_last_selection_note", ""),
    }


def _extract_reports_from_process_payload(process_payload: Dict) -> Dict:
    return {
        "redline_html": process_payload.get("redline_html", ""),
        "corrected_annotated_html": process_payload.get("corrected_annotated_html", ""),
        "corrections_report": process_payload.get("corrections_report") or {},
        "noun_report": process_payload.get("noun_report") or {},
        "domain_report": process_payload.get("domain_report") or {},
        "journal_profile_report": process_payload.get("journal_profile_report") or {},
        "citation_reference_report": process_payload.get("citation_reference_report") or {},
        "processing_audit": process_payload.get("processing_audit") or {},
        "processing_note": process_payload.get("processing_note", ""),
    }


def _store_task_export_files(task_row: Dict, original_text: str, corrected_text: str):
    task_id = str(task_row.get("id") or "")
    file_name = str(task_row.get("file_name") or "manuscript.docx")
    task_dir = _task_dir(task_id)
    processor = DocumentProcessor()

    clean_abs = os.path.join(task_dir, "clean.docx")
    highlighted_abs = os.path.join(task_dir, "highlighted.docx")

    processor.generate_clean_docx(corrected_text, clean_abs)
    processor.generate_highlighted_docx(original_text, corrected_text, highlighted_abs)

    expires_at = int(time.time()) + FILE_RETENTION_DAYS * 24 * 3600

    clean_rel = _to_storage_relative_path(clean_abs)
    highlighted_rel = _to_storage_relative_path(highlighted_abs)

    _STORE.upsert_task_file(
        task_id=task_id,
        file_type="clean",
        storage_path=clean_rel,
        download_name=_build_download_filename(file_name, "clean"),
        mime_type=MIME_DOCX,
        size_bytes=os.path.getsize(clean_abs),
        expires_at=expires_at,
    )
    _STORE.upsert_task_file(
        task_id=task_id,
        file_type="highlighted",
        storage_path=highlighted_rel,
        download_name=_build_download_filename(file_name, "highlighted"),
        mime_type=MIME_DOCX,
        size_bytes=os.path.getsize(highlighted_abs),
        expires_at=expires_at,
    )


def _task_summary(task_row: Dict) -> Dict:
    return {
        "id": str(task_row.get("id") or ""),
        "file_name": str(task_row.get("file_name") or ""),
        "status": str(task_row.get("status") or ""),
        "word_count": int(task_row.get("word_count") or 0),
        "source_type": str(task_row.get("source_type") or "text"),
        "created_at": int(task_row.get("created_at") or 0),
        "updated_at": int(task_row.get("updated_at") or 0),
        "processed_at": int(task_row.get("processed_at") or 0),
        "can_download_clean": str(task_row.get("status") or "") == "PROCESSED",
        "can_download_highlighted": str(task_row.get("status") or "") == "PROCESSED",
    }


def _get_owned_task_or_error(context: SessionContext, task_id: str) -> Tuple[Optional[Dict], Optional[HTTPResponse]]:
    task = _STORE.get_task_for_user(
        task_id=str(task_id or "").strip(),
        user_id=context.user_id,
        is_admin=context.role == ROLE_ADMIN,
    )
    if task is None:
        return None, _json_response(_error_payload("TASK_NOT_FOUND", "Task not found"), status=404)
    return task, None


def _upload_text_to_task(context: SessionContext, file_name: str, text: str, source_type: str, source_bytes: bytes = b"") -> Dict:
    safe_name = _safe_file_name(file_name, "manuscript.txt")
    task_id = uuid.uuid4().hex
    task_dir = _task_dir(task_id)
    ext = ".docx" if source_type == "docx" else ".txt"
    source_abs = os.path.join(task_dir, "source" + ext)

    if source_type == "docx":
        with open(source_abs, "wb") as outfile:
            outfile.write(source_bytes)
    else:
        with open(source_abs, "w", encoding="utf-8") as outfile:
            outfile.write(text)

    relative_source = _to_storage_relative_path(source_abs)

    task = _STORE.create_task(
        task_id=task_id,
        user_id=context.user_id,
        file_name=safe_name,
        source_type=source_type,
        source_path=relative_source,
        original_text=text,
        options={},
    )

    _record_audit(
        event_type="task_uploaded",
        actor_user_id=context.user_id,
        entity_type="task",
        entity_id=task_id,
        metadata={
            "file_name": safe_name,
            "source_type": source_type,
            "word_count": len(text.split()),
        },
    )

    return {
        "success": True,
        "task_id": task_id,
        "text": text,
        "word_count": len(text.split()),
        "file_name": safe_name,
        "task": _task_summary(task),
    }


def _process_task(context: SessionContext, task: Dict, options: Dict) -> Dict:
    processor = DocumentProcessor()
    original_text = str(task.get("original_text") or "")
    full_corrected_text = processor.process_text(original_text, options)
    corrected_text = full_corrected_text

    process_payload = _build_process_payload(
        processor=processor,
        task_row=task,
        corrected_text=corrected_text,
        full_corrected_text=full_corrected_text,
    )

    reports = _extract_reports_from_process_payload(process_payload)
    updated = _STORE.update_task_processing_result(
        task_id=str(task.get("id") or ""),
        user_id=context.user_id,
        corrected_text=corrected_text,
        full_corrected_text=full_corrected_text,
        word_count=process_payload["word_count"],
        options=options,
        reports=reports,
    )
    if updated is None:
        raise RuntimeError("Task update failed")

    _store_task_export_files(updated, original_text=original_text, corrected_text=corrected_text)

    _record_audit(
        event_type="task_processed",
        actor_user_id=context.user_id,
        entity_type="task",
        entity_id=str(task.get("id") or ""),
        metadata={"word_count": process_payload["word_count"]},
    )

    return process_payload


def _apply_group_decisions(context: SessionContext, task: Dict, group_decisions: Dict, fallback_full_corrected: str = "") -> Dict:
    original_text = str(task.get("original_text") or "")
    full_corrected = str(task.get("full_corrected_text") or "") or str(fallback_full_corrected or "")
    if not original_text.strip():
        raise RuntimeError("No document loaded")
    if not full_corrected.strip():
        raise RuntimeError("No corrected document available")

    processor = DocumentProcessor()
    corrected_text = processor.apply_group_decisions(original_text, full_corrected, group_decisions)

    process_payload = _build_process_payload(
        processor=processor,
        task_row=task,
        corrected_text=corrected_text,
        full_corrected_text=full_corrected,
    )
    reports = _extract_reports_from_process_payload(process_payload)

    updated = _STORE.update_task_corrected_text(
        task_id=str(task.get("id") or ""),
        user_id=context.user_id,
        corrected_text=corrected_text,
        reports=reports,
    )
    if updated is None:
        raise RuntimeError("Task update failed")

    _store_task_export_files(updated, original_text=original_text, corrected_text=corrected_text)

    _record_audit(
        event_type="task_group_decisions_applied",
        actor_user_id=context.user_id,
        entity_type="task",
        entity_id=str(task.get("id") or ""),
    )

    return process_payload


def _read_task_download_payload(context: SessionContext, task_id: str, file_type: str) -> Dict:
    normalized_type = "clean" if str(file_type or "").strip().lower() == "clean" else "highlighted"

    file_row = _STORE.get_task_file_for_user(
        task_id=task_id,
        file_type=normalized_type,
        user_id=context.user_id,
        is_admin=context.role == ROLE_ADMIN,
    )
    if file_row is None:
        # Try to regenerate from stored processed content if available.
        task = _STORE.get_task_for_user(task_id=task_id, user_id=context.user_id, is_admin=context.role == ROLE_ADMIN)
        if task and str(task.get("status") or "") == "PROCESSED":
            corrected = str(task.get("corrected_text") or "")
            original = str(task.get("original_text") or "")
            if corrected.strip() and original.strip():
                _store_task_export_files(task, original_text=original, corrected_text=corrected)
                file_row = _STORE.get_task_file_for_user(
                    task_id=task_id,
                    file_type=normalized_type,
                    user_id=context.user_id,
                    is_admin=context.role == ROLE_ADMIN,
                )

    if file_row is None:
        raise FileNotFoundError("No generated file is available for this task")

    file_abs = _resolve_storage_path(str(file_row.get("storage_path") or ""))
    if not os.path.isfile(file_abs):
        raise FileNotFoundError("Stored file was not found on disk")

    with open(file_abs, "rb") as infile:
        encoded = base64.b64encode(infile.read()).decode("ascii")

    _record_audit(
        event_type="task_downloaded",
        actor_user_id=context.user_id,
        entity_type="task",
        entity_id=task_id,
        metadata={"file_type": normalized_type},
    )

    return {
        "success": True,
        "task_id": task_id,
        "file_type": normalized_type,
        "file_name": str(file_row.get("download_name") or _build_download_filename("manuscript", normalized_type)),
        "mime_type": str(file_row.get("mime_type") or MIME_DOCX),
        "base64_data": encoded,
    }


def _run_retention_cleanup(force: bool = False):
    global _LAST_CLEANUP_AT
    now = time.time()
    with _CLEANUP_LOCK:
        if not force and now - _LAST_CLEANUP_AT < 300:
            return

        cutoff = int(now)
        for file_row in _STORE.get_expired_task_files(cutoff):
            try:
                abs_path = _resolve_storage_path(str(file_row.get("storage_path") or ""))
                if os.path.isfile(abs_path):
                    os.unlink(abs_path)
            except Exception:
                pass
            _STORE.mark_task_file_deleted(str(file_row.get("id") or ""), cutoff)

        _STORE.purge_expired_sessions()
        _LAST_CLEANUP_AT = now


def _maybe_run_cleanup():
    try:
        _run_retention_cleanup(force=False)
    except Exception:
        pass


def _validate_ai_provider_runtime(provider: str, model: str, api_key: str, ollama_host: str) -> Tuple[bool, str]:
    selected = str(provider or "").strip().lower()
    selected_model = str(model or "").strip()
    key = str(api_key or "").strip()
    host = str(ollama_host or "http://localhost:11434").strip() or "http://localhost:11434"

    if selected == "ollama":
        try:
            response = requests.get(f"{host}/api/tags", timeout=8)
            if response.status_code == 200:
                return True, f"Ollama reachable at {host}"
            return False, f"Ollama check failed ({response.status_code}) at {host}"
        except Exception as exc:
            return False, f"Ollama check failed: {exc}"

    if selected == "gemini":
        if not key:
            key = str(os.getenv("GEMINI_API_KEY", "") or "").strip()
        if not key:
            return False, "Gemini API key missing"
        use_model = selected_model or "gemini-1.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{use_model}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": [{"text": "Reply with OK only."}]}],
            "generationConfig": {"temperature": 0},
        }
        try:
            response = requests.post(url, json=payload, timeout=12)
            if response.status_code == 200:
                return True, f"Gemini reachable with model {use_model}"
            if response.status_code in (401, 403):
                return False, f"Gemini unauthorized/forbidden ({response.status_code})"
            return False, f"Gemini check failed ({response.status_code})"
        except Exception as exc:
            return False, f"Gemini check failed: {exc}"

    if selected in ("openrouter", "agent_router"):
        if not key:
            key = str(os.getenv("OPENROUTER_API_KEY", "") or "").strip()
        if not key:
            return False, "OpenRouter API key missing"
        use_model = selected_model or "openrouter/auto"
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }
        referer = str(os.getenv("OPENROUTER_HTTP_REFERER", "") or "").strip()
        title = str(os.getenv("OPENROUTER_APP_TITLE", "Manuscript Editor") or "").strip()
        if referer:
            headers["HTTP-Referer"] = referer
        if title:
            headers["X-Title"] = title
        payload = {
            "model": use_model,
            "messages": [{"role": "user", "content": "Reply with OK only."}],
            "temperature": 0,
            "max_tokens": 8,
        }
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=15,
            )
            if response.status_code == 200:
                return True, f"OpenRouter reachable with model {use_model}"
            if response.status_code in (401, 403):
                return False, f"OpenRouter unauthorized/forbidden ({response.status_code})"
            if response.status_code == 429:
                return False, "OpenRouter rate-limited (429)"
            return False, f"OpenRouter check failed ({response.status_code})"
        except Exception as exc:
            return False, f"OpenRouter check failed: {exc}"

    return False, f"Unsupported provider: {selected or 'unknown'}"


def _render_index_html(admin_dashboard: bool = False) -> HTTPResponse:
    _ensure_web_assets()
    index_path = os.path.join(WEB_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as handle:
        html = handle.read()

    if admin_dashboard:
        html = html.replace(
            "<body>",
            '<body class="admin-dashboard-route admin-dashboard-active">',
            1,
        )
        html = html.replace(
            'class="setup-wizard-backdrop hidden" id="admin-panel-backdrop"',
            'class="setup-wizard-backdrop" id="admin-panel-backdrop"',
            1,
        )

    return HTTPResponse(body=html, status=200, headers={"Content-Type": "text/html; charset=utf-8"})


@app.get("/")
def index():
    return _render_index_html(admin_dashboard=False)


@app.get("/admin-dashboard")
@app.get("/admin-dashboard/")
def admin_dashboard_index():
    return _render_index_html(admin_dashboard=True)


@app.get("/eel.js")
def eel_bridge():
    _ensure_web_assets()
    asset = static_file("eel_web_bridge.js", root=WEB_DIR, mimetype="application/javascript")
    try:
        asset.set_header("Cache-Control", "no-store, max-age=0, must-revalidate")
        asset.set_header("Pragma", "no-cache")
    except Exception:
        pass
    return asset


@app.get("/api/health")
def api_health():
    return _json_response(
        {
            "success": True,
            "status": "ok",
            "storage_backend": _STORE.backend,
            "auth_required": True,
        }
    )


@app.get("/api/auth/config")
def api_auth_config():
    return _json_response(
        {
            "success": True,
            "google_client_id": GOOGLE_CLIENT_ID,
            "allowed_domains": ALLOWED_EMAIL_DOMAINS,
        }
    )


@app.post("/api/auth/google-login")
def api_auth_google_login():
    payload = _read_json_payload()
    id_token_raw = str(payload.get("id_token", "") or "")

    try:
        token_info = _verify_google_token(id_token_raw)
    except Exception as exc:
        _record_audit(
            event_type="auth_login_failed",
            metadata={"reason": str(exc)},
        )
        return _json_response(_error_payload("AUTH_INVALID_TOKEN", str(exc)), status=401)

    email = str(token_info.get("email", "") or "").strip().lower()
    if "@" not in email:
        _record_audit(event_type="auth_login_failed", metadata={"reason": "missing_email"})
        return _json_response(_error_payload("AUTH_EMAIL_MISSING", "Google account email is missing"), status=401)

    if not bool(token_info.get("email_verified", False)):
        _record_audit(event_type="auth_login_failed", metadata={"reason": "email_not_verified", "email": email})
        return _json_response(_error_payload("AUTH_EMAIL_UNVERIFIED", "Google account email is not verified"), status=401)

    domain = email.rsplit("@", 1)[-1].lower().strip()
    if domain not in ALLOWED_EMAIL_DOMAINS:
        _record_audit(
            event_type="auth_login_blocked_domain",
            metadata={"email": email, "domain": domain},
        )
        return _json_response(
            _error_payload("AUTH_DOMAIN_BLOCKED", "This email domain is not allowed"),
            status=403,
        )

    google_sub = str(token_info.get("sub", "") or "").strip()
    if not google_sub:
        return _json_response(_error_payload("AUTH_SUB_MISSING", "Token subject missing"), status=401)

    display_name = str(token_info.get("name", "") or email.split("@", 1)[0]).strip()
    _STORE.bootstrap_admin_roles(ADMIN_EMAILS)

    user = _STORE.upsert_google_user(
        email=email,
        google_sub=google_sub,
        display_name=display_name,
        domain=domain,
        admin_emails=ADMIN_EMAILS,
    )

    if str(user.get("status") or STATUS_ACTIVE) != STATUS_ACTIVE:
        _record_audit(
            event_type="auth_login_blocked_inactive",
            actor_user_id=str(user.get("id") or ""),
            metadata={"email": email},
        )
        return _json_response(_error_payload("AUTH_USER_INACTIVE", "User access is inactive"), status=403)

    session_id = _STORE.create_session(
        user_id=str(user.get("id") or ""),
        ttl_hours=SESSION_TTL_HOURS,
        ip_address=_get_client_ip(),
        user_agent=_get_user_agent(),
    )

    _record_audit(
        event_type="auth_login_success",
        actor_user_id=str(user.get("id") or ""),
        metadata={"email": email, "role": str(user.get("role") or "USER")},
    )

    return _json_response(
        {
            "success": True,
            "user": {
                "id": str(user.get("id") or ""),
                "email": email,
                "display_name": str(user.get("display_name") or display_name),
                "role": str(user.get("role") or "USER"),
                "status": str(user.get("status") or STATUS_ACTIVE),
            },
            "allowed_domains": ALLOWED_EMAIL_DOMAINS,
        },
        session_id=session_id,
    )


@app.get("/api/auth/me")
def api_auth_me():
    context, response = _require_auth_context()
    if response is not None:
        return response
    return _json_response({"success": True, "user": _public_user_payload(context)}, session_id=context.session_id)


@app.post("/api/auth/logout")
def api_auth_logout():
    session_id = _get_session_id_from_request()
    context = _STORE.get_session_context(session_id) if session_id else None

    if session_id:
        _STORE.revoke_session(session_id)
    if context:
        _record_audit(event_type="auth_logout", actor_user_id=context.user_id)

    return _json_response({"success": True}, clear_session=True)


@app.get("/api/runtime-telemetry")
@require_auth
def get_runtime_telemetry():
    context = _auth_context_from_request()
    return _json_response({"success": True, "telemetry": _read_runtime_telemetry(context.session_id)})


@app.post("/api/runtime-telemetry/reset")
@require_auth
def reset_runtime_telemetry():
    context = _auth_context_from_request()
    _reset_runtime_telemetry(context.session_id)
    return _json_response({"success": True})


@app.post("/api/reset-session")
@require_auth
def reset_session():
    context = _auth_context_from_request()
    _reset_runtime_telemetry(context.session_id)
    return _json_response({"success": True})


@app.get("/api/settings/runtime")
@require_auth
def api_runtime_settings():
    context = _auth_context_from_request()
    settings = _read_global_runtime_settings()
    payload_settings = settings if context.role == ROLE_ADMIN else _global_runtime_settings_for_user_payload(settings)
    return _json_response({"success": True, "settings": payload_settings}, session_id=context.session_id)


@app.post("/api/tasks/upload-text")
@require_auth
def api_tasks_upload_text():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    file_name = str(payload.get("file_name", "manuscript.txt") or "manuscript.txt")
    content = str(payload.get("content", "") or "")

    try:
        result = _upload_text_to_task(context, file_name=file_name, text=content, source_type="text")
        return _json_response(result, session_id=context.session_id)
    except Exception as exc:
        return _json_response(_error_payload("TASK_UPLOAD_FAILED", str(exc)), status=400, session_id=context.session_id)


@app.post("/api/tasks/upload-docx")
@require_auth
def api_tasks_upload_docx():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    file_name = str(payload.get("file_name", "manuscript.docx") or "manuscript.docx")
    base64_data = str(payload.get("base64_data", "") or "")

    try:
        byte_data = base64.b64decode(base64_data)
    except Exception:
        return _json_response(_error_payload("TASK_UPLOAD_INVALID_BASE64", "Invalid base64 document payload"), status=400)

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            handle.write(byte_data)
            temp_path = handle.name

        processor = DocumentProcessor()
        text, _ = processor.load_document(temp_path)
        result = _upload_text_to_task(
            context,
            file_name=file_name,
            text=text,
            source_type="docx",
            source_bytes=byte_data,
        )
        return _json_response(result, session_id=context.session_id)
    except Exception as exc:
        return _json_response(_error_payload("TASK_UPLOAD_FAILED", str(exc)), status=400, session_id=context.session_id)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@app.get("/api/tasks")
@require_auth
def api_tasks_list():
    context = _auth_context_from_request()
    try:
        limit = int(str(request.query.get("limit", "100") or "100"))
    except Exception:
        limit = 100
    tasks = _STORE.list_tasks_for_user(user_id=context.user_id, limit=limit)
    return _json_response(
        {
            "success": True,
            "tasks": [_task_summary(task) for task in tasks],
        },
        session_id=context.session_id,
    )


@app.get("/api/tasks/<task_id>")
@require_auth
def api_tasks_get(task_id: str):
    context = _auth_context_from_request()
    task, error = _get_owned_task_or_error(context, task_id)
    if error is not None:
        return error

    reports = task.get("reports") or {}

    clean_file = _STORE.get_task_file_for_user(
        task_id=task_id,
        file_type="clean",
        user_id=context.user_id,
        is_admin=context.role == ROLE_ADMIN,
    )
    highlighted_file = _STORE.get_task_file_for_user(
        task_id=task_id,
        file_type="highlighted",
        user_id=context.user_id,
        is_admin=context.role == ROLE_ADMIN,
    )

    payload = {
        "success": True,
        "task": {
            **_task_summary(task),
            "original_text": str(task.get("original_text") or ""),
            "corrected_text": str(task.get("corrected_text") or ""),
            "full_corrected_text": str(task.get("full_corrected_text") or ""),
            "options": task.get("options") or {},
            "reports": reports,
            "downloads": {
                "clean": clean_file is not None,
                "highlighted": highlighted_file is not None,
            },
        },
    }
    return _json_response(payload, session_id=context.session_id)


@app.post("/api/tasks/<task_id>/process")
@require_auth
def api_tasks_process(task_id: str):
    context = _auth_context_from_request()
    payload = _read_json_payload()
    options = payload.get("options", {})
    if not isinstance(options, dict):
        options = {}
    options = _apply_global_runtime_settings(options, _read_global_runtime_settings())

    task, error = _get_owned_task_or_error(context, task_id)
    if error is not None:
        return error

    try:
        process_payload = _process_task(context, task, options)
        return _json_response(process_payload, session_id=context.session_id)
    except Exception as exc:
        _record_audit(
            event_type="task_process_failed",
            actor_user_id=context.user_id,
            entity_type="task",
            entity_id=task_id,
            metadata={"error": str(exc)},
        )
        return _json_response(_error_payload("TASK_PROCESS_FAILED", str(exc)), status=500, session_id=context.session_id)


@app.post("/api/tasks/<task_id>/apply-correction-group-decisions")
@require_auth
def api_tasks_apply_group_decisions(task_id: str):
    context = _auth_context_from_request()
    payload = _read_json_payload()
    group_decisions = payload.get("group_decisions", {})
    if not isinstance(group_decisions, dict):
        group_decisions = {}

    task, error = _get_owned_task_or_error(context, task_id)
    if error is not None:
        return error

    try:
        process_payload = _apply_group_decisions(
            context,
            task,
            group_decisions,
            fallback_full_corrected=str(payload.get("full_corrected_text", "") or ""),
        )
        return _json_response(process_payload, session_id=context.session_id)
    except Exception as exc:
        return _json_response(_error_payload("TASK_DECISION_APPLY_FAILED", str(exc)), status=500, session_id=context.session_id)


@app.get("/api/tasks/<task_id>/download")
@require_auth
def api_tasks_download(task_id: str):
    context = _auth_context_from_request()
    file_type = str(request.query.get("type", "") or request.query.get("file_type", "") or "clean")

    try:
        _increment_runtime_counter(context.session_id, "export_attempts")
        payload = _read_task_download_payload(context, task_id=task_id, file_type=file_type)
        _increment_runtime_counter(context.session_id, "export_successes")
        return _json_response(payload, session_id=context.session_id)
    except Exception as exc:
        _increment_runtime_counter(context.session_id, "export_failures", "EXPORT_FILE_MISSING")
        return _json_response(
            _error_payload("EXPORT_FILE_MISSING", str(exc)),
            status=404,
            session_id=context.session_id,
        )


@app.post("/api/load-text")
@require_auth
def load_text_content_legacy():
    return api_tasks_upload_text()


@app.post("/api/load-docx")
@require_auth
def load_docx_content_legacy():
    return api_tasks_upload_docx()


@app.post("/api/process-document")
@require_auth
def process_document_legacy():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    options = payload.get("options", {})
    if not isinstance(options, dict):
        options = {}
    options = _apply_global_runtime_settings(options, _read_global_runtime_settings())

    task_id = str(payload.get("task_id", "") or "").strip()
    source_text = str(payload.get("source_text", "") or "")
    source_file_name = str(payload.get("source_file_name", "manuscript.txt") or "manuscript.txt")

    try:
        if not task_id and source_text.strip():
            uploaded = _upload_text_to_task(
                context,
                file_name=source_file_name,
                text=source_text,
                source_type="text",
            )
            task_id = str(uploaded.get("task_id") or "")

        if not task_id:
            return _json_response(_error_payload("TASK_REQUIRED", "No task selected"), status=400)

        task, error = _get_owned_task_or_error(context, task_id)
        if error is not None:
            return error

        process_payload = _process_task(context, task, options)
        return _json_response(process_payload, session_id=context.session_id)
    except Exception as exc:
        return _json_response(_error_payload("TASK_PROCESS_FAILED", str(exc)), status=500, session_id=context.session_id)


@app.post("/api/apply-correction-group-decisions")
@require_auth
def apply_correction_group_decisions_legacy():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    task_id = str(payload.get("task_id", "") or "").strip()
    group_decisions = payload.get("group_decisions", {})
    if not isinstance(group_decisions, dict):
        group_decisions = {}

    if not task_id:
        return _json_response(_error_payload("TASK_REQUIRED", "No task selected"), status=400)

    task, error = _get_owned_task_or_error(context, task_id)
    if error is not None:
        return error

    try:
        process_payload = _apply_group_decisions(
            context,
            task,
            group_decisions,
            fallback_full_corrected=str(payload.get("full_corrected_text", "") or ""),
        )
        return _json_response(process_payload, session_id=context.session_id)
    except Exception as exc:
        return _json_response(_error_payload("TASK_DECISION_APPLY_FAILED", str(exc)), status=500, session_id=context.session_id)


@app.get("/api/redline-preview")
@require_auth
def get_redline_preview_legacy():
    context = _auth_context_from_request()
    task_id = str(request.query.get("task_id", "") or "").strip()
    if not task_id:
        return _json_response(_error_payload("TASK_REQUIRED", "No task selected"), status=400)

    task, error = _get_owned_task_or_error(context, task_id)
    if error is not None:
        return error

    original = str(task.get("original_text") or "")
    corrected = str(task.get("corrected_text") or "")
    if not original.strip():
        return _json_response(_error_payload("TASK_EMPTY", "No document loaded"), status=400)
    if not corrected.strip():
        return _json_response(_error_payload("TASK_NOT_PROCESSED", "No corrected document available"), status=400)

    processor = DocumentProcessor()
    redline_html = processor.build_redline_html(original, corrected)
    return _json_response({"success": True, "task_id": task_id, "redline_html": redline_html}, session_id=context.session_id)


@app.get("/api/ollama-models")
@require_auth
def get_ollama_models_legacy():
    context = _auth_context_from_request()
    try:
        processor = DocumentProcessor()
        host = str(request.query.get("ollama_host", "") or processor.ollama_host).strip() or processor.ollama_host
        models = processor._get_ollama_models(host)
        default_model = processor._resolve_ollama_model(host, processor.model)
        return _json_response(
            {
                "success": True,
                "models": models,
                "default_model": default_model,
            },
            session_id=context.session_id,
        )
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc), "models": []}, status=500, session_id=context.session_id)


@app.post("/api/export-file")
@require_auth
def export_file_legacy():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    task_id = str(payload.get("task_id", "") or "").strip()
    file_type = str(payload.get("file_type", "") or "clean")

    _increment_runtime_counter(context.session_id, "export_attempts")

    try:
        if task_id:
            response_payload = _read_task_download_payload(context, task_id=task_id, file_type=file_type)
            _increment_runtime_counter(context.session_id, "export_successes")
            return _json_response(response_payload, session_id=context.session_id)

        # Fallback compatibility path when frontend has text but no persisted task id.
        original_text = str(payload.get("original_text", "") or "")
        corrected_text = str(payload.get("corrected_text", "") or "")
        file_name = str(payload.get("file_name", "manuscript.docx") or "manuscript.docx")
        normalized_type = "clean" if file_type == "clean" else "highlighted"

        if not corrected_text.strip():
            _increment_runtime_counter(context.session_id, "export_failures", "EXPORT_NO_CORRECTED_DOC")
            return _json_response(
                _error_payload("EXPORT_NO_CORRECTED_DOC", "No corrected document available"),
                status=400,
                session_id=context.session_id,
            )

        processor = DocumentProcessor()
        temp_path = None
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            temp_path = handle.name

        try:
            if normalized_type == "clean":
                processor.generate_clean_docx(corrected_text, temp_path)
            else:
                processor.generate_highlighted_docx(original_text, corrected_text, temp_path)

            with open(temp_path, "rb") as infile:
                encoded = base64.b64encode(infile.read()).decode("ascii")

            _increment_runtime_counter(context.session_id, "export_successes")
            return _json_response(
                {
                    "success": True,
                    "file_name": _build_download_filename(file_name, normalized_type),
                    "mime_type": MIME_DOCX,
                    "base64_data": encoded,
                },
                session_id=context.session_id,
            )
        finally:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
    except Exception as exc:
        _increment_runtime_counter(context.session_id, "export_failures", "EXPORT_EXCEPTION")
        return _json_response(_error_payload("EXPORT_EXCEPTION", str(exc)), status=500, session_id=context.session_id)


@app.post("/api/save-file")
@require_auth
def save_file_legacy():
    context = _auth_context_from_request()
    _increment_runtime_counter(context.session_id, "save_attempts")
    _increment_runtime_counter(context.session_id, "save_failures", "SAVE_BROWSER_MODE_UNSUPPORTED")
    return _json_response(
        _error_payload(
            "SAVE_BROWSER_MODE_UNSUPPORTED",
            "Browser mode uses downloads instead of server-side save dialogs.",
        ),
        status=400,
        session_id=context.session_id,
    )


@app.get("/api/admin/users")
@require_admin
def api_admin_users():
    context = _auth_context_from_request()
    try:
        limit = int(str(request.query.get("limit", "200") or "200"))
    except Exception:
        limit = 200

    users = _STORE.list_users(limit=limit)
    payload = []
    for user in users:
        payload.append(
            {
                "id": str(user.get("id") or ""),
                "email": str(user.get("email") or ""),
                "display_name": str(user.get("display_name") or ""),
                "domain": str(user.get("domain") or ""),
                "role": str(user.get("role") or "USER"),
                "status": str(user.get("status") or STATUS_ACTIVE),
                "last_login_at": int(user.get("last_login_at") or 0),
                "created_at": int(user.get("created_at") or 0),
                "updated_at": int(user.get("updated_at") or 0),
            }
        )

    _record_audit(event_type="admin_users_viewed", actor_user_id=context.user_id)
    return _json_response({"success": True, "users": payload}, session_id=context.session_id)


@app.post("/api/admin/users/<user_id>/status")
@require_admin
def api_admin_set_user_status(user_id: str):
    context = _auth_context_from_request()
    payload = _read_json_payload()
    status = str(payload.get("status", STATUS_ACTIVE) or STATUS_ACTIVE).upper().strip()
    if status not in (STATUS_ACTIVE, STATUS_INACTIVE):
        status = STATUS_INACTIVE

    if user_id == context.user_id and status == STATUS_INACTIVE:
        return _json_response(_error_payload("ADMIN_SELF_DEACTIVATE_BLOCKED", "Admin cannot deactivate self"), status=400)

    user = _STORE.set_user_status(user_id=user_id, status=status)
    if user is None:
        return _json_response(_error_payload("USER_NOT_FOUND", "User not found"), status=404)

    _record_audit(
        event_type="admin_user_status_changed",
        actor_user_id=context.user_id,
        target_user_id=user_id,
        entity_type="user",
        entity_id=user_id,
        metadata={"status": status},
    )

    return _json_response(
        {
            "success": True,
            "user": {
                "id": str(user.get("id") or ""),
                "email": str(user.get("email") or ""),
                "display_name": str(user.get("display_name") or ""),
                "role": str(user.get("role") or "USER"),
                "status": str(user.get("status") or STATUS_ACTIVE),
            },
        },
        session_id=context.session_id,
    )


@app.get("/api/admin/audit-events")
@require_admin
def api_admin_audit_events():
    context = _auth_context_from_request()

    try:
        limit = int(str(request.query.get("limit", "200") or "200"))
    except Exception:
        limit = 200

    actor_user_id = str(request.query.get("actor_user_id", "") or "").strip()
    event_type = str(request.query.get("event_type", "") or "").strip()

    try:
        date_from = int(str(request.query.get("date_from", "0") or "0"))
    except Exception:
        date_from = 0

    try:
        date_to = int(str(request.query.get("date_to", "0") or "0"))
    except Exception:
        date_to = 0

    events = _STORE.list_audit_events(
        limit=limit,
        actor_user_id=actor_user_id,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )

    _record_audit(event_type="admin_audit_viewed", actor_user_id=context.user_id)
    return _json_response({"success": True, "events": events}, session_id=context.session_id)


@app.get("/api/admin/global-settings")
@require_admin
def api_admin_get_global_settings():
    context = _auth_context_from_request()
    settings = _read_global_runtime_settings()
    _record_audit(event_type="admin_global_settings_viewed", actor_user_id=context.user_id)
    return _json_response({"success": True, "settings": settings}, session_id=context.session_id)


@app.post("/api/admin/global-settings")
@require_admin
def api_admin_update_global_settings():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    incoming = payload.get("settings", payload)
    if not isinstance(incoming, dict):
        incoming = {}
    normalized = _normalize_global_runtime_settings(incoming)
    _STORE.upsert_app_setting(
        key=APP_SETTING_KEY_GLOBAL_RUNTIME,
        value=normalized,
        updated_by_user_id=context.user_id,
    )
    _record_audit(
        event_type="admin_global_settings_updated",
        actor_user_id=context.user_id,
        metadata={
            "ai_provider": normalized.get("ai", {}).get("provider"),
            "ai_enabled": normalized.get("ai", {}).get("enabled"),
            "domain_profile": normalized.get("editing", {}).get("domain_profile"),
        },
    )
    return _json_response({"success": True, "settings": normalized}, session_id=context.session_id)


@app.post("/api/admin/validate-ai-provider")
@require_admin
def api_admin_validate_ai_provider():
    context = _auth_context_from_request()
    payload = _read_json_payload()
    provider = str(payload.get("provider", "") or "").strip().lower()
    model = str(payload.get("model", "") or "").strip()
    api_key = str(payload.get("api_key", "") or "").strip()
    ollama_host = str(payload.get("ollama_host", "") or "").strip()

    ok, message = _validate_ai_provider_runtime(provider, model, api_key, ollama_host)
    _record_audit(
        event_type="admin_ai_provider_validated",
        actor_user_id=context.user_id,
        metadata={
            "provider": provider,
            "model": model,
            "ok": bool(ok),
        },
    )
    return _json_response(
        {
            "success": True,
            "provider": provider,
            "model": model,
            "valid": bool(ok),
            "message": str(message or ""),
        },
        session_id=context.session_id,
    )


@app.get("/<asset_path:path>")
def serve_static_assets(asset_path: str):
    if asset_path.startswith("api/"):
        return HTTPResponse(status=404, body="Not found")
    return static_file(asset_path, root=WEB_DIR)


def main():
    _ensure_web_assets()
    host = os.getenv("MANUSCRIPT_EDITOR_HOST", "127.0.0.1")
    try:
        port = int(os.getenv("MANUSCRIPT_EDITOR_PORT", os.getenv("PORT", "8000")))
    except Exception:
        port = 8000

    print(f"Manuscript Editor web app listening on http://{host}:{port}")
    print(f"Auth domains: {', '.join(ALLOWED_EMAIL_DOMAINS)}")
    print(f"DB backend: {_STORE.backend}")

    run(app=app, host=host, port=port, debug=False, reloader=False)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Deployable WSGI web application for Manuscript Editor."""

import base64
import json
import os
import tempfile
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional

from bottle import Bottle, HTTPResponse, request, run, static_file

from document_processor import DocumentProcessor


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT_DIR, "web")
REQUIRED_WEB_ASSETS = ("index.html", "style.css", "app.js", "eel_web_bridge.js")
SESSION_COOKIE_NAME = "manuscript_editor_sid"
SESSION_COOKIE_ENV_KEY = "manuscript_editor.session_id"
SESSION_TTL_SECONDS = 12 * 60 * 60
SESSION_STORE_LIMIT = 256

_SESSION_LOCK = threading.Lock()
_SESSION_STORE: Dict[str, "SessionState"] = {}


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


@dataclass
class SessionState:
    processor: DocumentProcessor = field(default_factory=DocumentProcessor)
    current_file: Optional[str] = None
    original_text: str = ""
    corrected_text: str = ""
    full_corrected_text: str = ""
    runtime_telemetry: Dict = field(default_factory=_default_runtime_telemetry)
    last_accessed: float = field(default_factory=time.time)

    def reset_editor_state(self):
        """Clear the currently loaded manuscript from this browser session."""
        self.current_file = None
        self.original_text = ""
        self.corrected_text = ""
        self.full_corrected_text = ""
        self.processor = DocumentProcessor()


def _ensure_web_assets():
    missing = [name for name in REQUIRED_WEB_ASSETS if not os.path.isfile(os.path.join(WEB_DIR, name))]
    if missing:
        raise FileNotFoundError(f"Missing web assets in {WEB_DIR}: {', '.join(missing)}")


def _json_response(payload: Dict, status: int = 200) -> HTTPResponse:
    http_response = HTTPResponse(
        status=status,
        body=json.dumps(payload),
        headers={"Content-Type": "application/json"},
    )
    session_id = str(request.environ.get(SESSION_COOKIE_ENV_KEY, "") or "").strip()
    if session_id:
        http_response.set_cookie(
            SESSION_COOKIE_NAME,
            session_id,
            path="/",
            httponly=True,
            samesite="Lax",
        )
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


def _record_error(state: SessionState, code: str):
    bucket = state.runtime_telemetry.setdefault("errors_by_code", {})
    bucket[code] = int(bucket.get(code, 0)) + 1


def _error_payload(state: SessionState, code: str, message: str, **extra) -> Dict:
    payload = {"success": False, "error": message, "error_code": code}
    payload.update(extra)
    _record_error(state, code)
    return payload


def _prune_sessions_locked(now: float):
    expired = [
        session_id
        for session_id, state in _SESSION_STORE.items()
        if now - float(state.last_accessed) > SESSION_TTL_SECONDS
    ]
    for session_id in expired:
        _SESSION_STORE.pop(session_id, None)

    overflow = len(_SESSION_STORE) - SESSION_STORE_LIMIT
    if overflow > 0:
        oldest = sorted(_SESSION_STORE.items(), key=lambda item: float(item[1].last_accessed))
        for session_id, _ in oldest[:overflow]:
            _SESSION_STORE.pop(session_id, None)


def _get_session_state() -> SessionState:
    now = time.time()
    incoming_session_id = str(request.get_cookie(SESSION_COOKIE_NAME) or "").strip()
    with _SESSION_LOCK:
        _prune_sessions_locked(now)
        state = _SESSION_STORE.get(incoming_session_id)
        if state is None:
            incoming_session_id = uuid.uuid4().hex
            state = SessionState()
            _SESSION_STORE[incoming_session_id] = state
        state.last_accessed = now

    request.environ[SESSION_COOKIE_ENV_KEY] = incoming_session_id
    return state


def _load_text_to_state(state: SessionState, file_name: str, text: str) -> Dict:
    state.current_file = file_name
    state.original_text = text
    state.corrected_text = ""
    state.full_corrected_text = ""
    return {
        "success": True,
        "text": state.original_text,
        "word_count": len(state.original_text.split()),
    }


def _build_process_payload(state: SessionState, original: str, corrected: str) -> Dict:
    return {
        "success": True,
        "text": corrected,
        "original": original,
        "word_count": len(corrected.split()),
        "redline_html": state.processor.build_redline_html(original, corrected),
        "corrected_annotated_html": state.processor.build_foreign_annotated_html(corrected),
        "corrections_report": state.processor.build_corrections_report(original, corrected),
        "noun_report": state.processor.build_noun_report(corrected),
        "domain_report": state.processor.get_domain_report(),
        "journal_profile_report": state.processor.get_journal_profile_report(),
        "citation_reference_report": state.processor.get_citation_reference_report(),
        "processing_audit": state.processor.get_processing_audit(),
        "processing_note": getattr(state.processor, "_last_selection_note", ""),
    }


def _build_download_filename(state: SessionState, file_type: str) -> str:
    base_name = os.path.splitext(os.path.basename(state.current_file or "manuscript"))[0].strip() or "manuscript"
    suffix = "clean" if file_type == "clean" else "highlighted"
    return f"{base_name}_{suffix}.docx"


def _export_file_payload(state: SessionState, file_type: str) -> Dict:
    temp_path = None
    state.runtime_telemetry["export_attempts"] += 1

    try:
        if not state.corrected_text.strip():
            state.runtime_telemetry["export_failures"] += 1
            return _error_payload(state, "EXPORT_NO_CORRECTED_DOC", "No corrected document available")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            temp_path = handle.name

        if file_type == "clean":
            state.processor.generate_clean_docx(state.corrected_text, temp_path)
        elif file_type in ("highlighted", "redline"):
            state.processor.generate_highlighted_docx(state.original_text, state.corrected_text, temp_path)
        else:
            state.runtime_telemetry["export_failures"] += 1
            return _error_payload(state, "EXPORT_UNSUPPORTED_TYPE", "Unsupported file type", file_type=str(file_type))

        with open(temp_path, "rb") as infile:
            encoded = base64.b64encode(infile.read()).decode("ascii")

        state.runtime_telemetry["export_successes"] += 1
        return {
            "success": True,
            "file_name": _build_download_filename(state, file_type),
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "base64_data": encoded,
        }
    except Exception as exc:
        state.runtime_telemetry["export_failures"] += 1
        return _error_payload(state, "EXPORT_EXCEPTION", str(exc))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


app = Bottle()


@app.get("/")
def index():
    _ensure_web_assets()
    return static_file("index.html", root=WEB_DIR)


@app.get("/eel.js")
def eel_bridge():
    _ensure_web_assets()
    return static_file("eel_web_bridge.js", root=WEB_DIR, mimetype="application/javascript")


@app.get("/api/health")
def api_health():
    _get_session_state()
    return _json_response({"success": True, "status": "ok"})


@app.get("/api/runtime-telemetry")
def get_runtime_telemetry():
    state = _get_session_state()
    return _json_response({"success": True, "telemetry": state.runtime_telemetry})


@app.post("/api/runtime-telemetry/reset")
def reset_runtime_telemetry():
    state = _get_session_state()
    state.runtime_telemetry = _default_runtime_telemetry()
    return _json_response({"success": True})


@app.post("/api/reset-session")
def reset_session():
    state = _get_session_state()
    state.reset_editor_state()
    return _json_response({"success": True})


@app.post("/api/load-text")
def load_text_content():
    state = _get_session_state()
    payload = _read_json_payload()
    file_name = str(payload.get("file_name", "manuscript.txt") or "manuscript.txt")
    content = str(payload.get("content", "") or "")
    try:
        return _json_response(_load_text_to_state(state, file_name, content))
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc)}, status=400)


@app.post("/api/load-docx")
def load_docx_content():
    state = _get_session_state()
    payload = _read_json_payload()
    file_name = str(payload.get("file_name", "manuscript.docx") or "manuscript.docx")
    base64_data = str(payload.get("base64_data", "") or "")
    try:
        byte_data = base64.b64decode(base64_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            handle.write(byte_data)
            temp_path = handle.name

        try:
            text, _ = state.processor.load_document(temp_path)
            return _json_response(_load_text_to_state(state, file_name, text))
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc) + "\n" + traceback.format_exc()}, status=400)


@app.post("/api/process-document")
def process_document():
    state = _get_session_state()
    payload = _read_json_payload()
    options = payload.get("options", {})
    if not isinstance(options, dict):
        options = {}

    try:
        if not state.original_text.strip():
            return _json_response({"success": False, "error": "No document loaded"}, status=400)

        state.full_corrected_text = state.processor.process_text(state.original_text, options)
        state.corrected_text = state.full_corrected_text
        return _json_response(_build_process_payload(state, state.original_text, state.corrected_text))
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc)}, status=500)


@app.post("/api/apply-correction-group-decisions")
def apply_correction_group_decisions():
    state = _get_session_state()
    payload = _read_json_payload()
    group_decisions = payload.get("group_decisions", {})
    if not isinstance(group_decisions, dict):
        group_decisions = {}

    try:
        if not state.original_text.strip():
            return _json_response({"success": False, "error": "No document loaded"}, status=400)
        if not state.full_corrected_text.strip():
            return _json_response({"success": False, "error": "No corrected document available"}, status=400)

        state.corrected_text = state.processor.apply_group_decisions(
            state.original_text,
            state.full_corrected_text,
            group_decisions,
        )
        return _json_response(_build_process_payload(state, state.original_text, state.corrected_text))
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc)}, status=500)


@app.get("/api/redline-preview")
def get_redline_preview():
    state = _get_session_state()
    try:
        if not state.original_text.strip():
            return _json_response({"success": False, "error": "No document loaded"}, status=400)
        if not state.corrected_text.strip():
            return _json_response({"success": False, "error": "No corrected document available"}, status=400)
        return _json_response({
            "success": True,
            "redline_html": state.processor.build_redline_html(state.original_text, state.corrected_text),
        })
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc)}, status=500)


@app.get("/api/ollama-models")
def get_ollama_models():
    state = _get_session_state()
    try:
        host = str(request.query.get("ollama_host", "") or state.processor.ollama_host).strip() or state.processor.ollama_host
        models = state.processor._get_ollama_models(host)
        default_model = state.processor._resolve_ollama_model(host, state.processor.model)
        return _json_response({
            "success": True,
            "models": models,
            "default_model": default_model,
        })
    except Exception as exc:
        return _json_response({"success": False, "error": str(exc), "models": []}, status=500)


@app.post("/api/export-file")
def export_file():
    state = _get_session_state()
    payload = _read_json_payload()
    file_type = str(payload.get("file_type", "") or "")
    return _json_response(_export_file_payload(state, file_type))


@app.post("/api/save-file")
def save_file():
    state = _get_session_state()
    state.runtime_telemetry["save_attempts"] += 1
    state.runtime_telemetry["save_failures"] += 1
    return _json_response(
        _error_payload(
            state,
            "SAVE_BROWSER_MODE_UNSUPPORTED",
            "Browser mode uses downloads instead of server-side save dialogs.",
        ),
        status=400,
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
    run(app=app, host=host, port=port, debug=False, reloader=False)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Manuscript Editor backend for Eel web UI."""

import base64
import os
import sys
import tempfile
import traceback

import eel

from document_processor import DocumentProcessor


processor = DocumentProcessor()
current_file = None
original_text = ""
corrected_text = ""
full_corrected_text = ""
runtime_telemetry = {
    "export_attempts": 0,
    "export_successes": 0,
    "export_failures": 0,
    "save_attempts": 0,
    "save_successes": 0,
    "save_failures": 0,
    "save_fallback_used": 0,
    "errors_by_code": {},
}

def _runtime_base_dir() -> str:
    """Return base directory for source and PyInstaller-frozen runtime."""
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


web_folder = os.path.join(_runtime_base_dir(), "web")
required_web_assets = ("index.html", "style.css", "app.js")


def _record_error(code: str):
    """Increase per-error-code telemetry counter."""
    bucket = runtime_telemetry.setdefault("errors_by_code", {})
    bucket[code] = int(bucket.get(code, 0)) + 1


def _error_payload(code: str, message: str, **extra):
    """Standardized error payload with code for UI handling."""
    payload = {"success": False, "error": message, "error_code": code}
    payload.update(extra)
    _record_error(code)
    return payload


def setup_web_folder():
    """Validate that static web assets exist."""
    os.makedirs(web_folder, exist_ok=True)
    missing = [name for name in required_web_assets if not os.path.isfile(os.path.join(web_folder, name))]
    if missing:
        raise FileNotFoundError(f"Missing web assets in {web_folder}: {', '.join(missing)}")


@eel.expose
def get_runtime_telemetry():
    """Return current runtime telemetry counters."""
    return {"success": True, "telemetry": runtime_telemetry}


@eel.expose
def reset_runtime_telemetry():
    """Reset runtime telemetry counters."""
    runtime_telemetry["export_attempts"] = 0
    runtime_telemetry["export_successes"] = 0
    runtime_telemetry["export_failures"] = 0
    runtime_telemetry["save_attempts"] = 0
    runtime_telemetry["save_successes"] = 0
    runtime_telemetry["save_failures"] = 0
    runtime_telemetry["save_fallback_used"] = 0
    runtime_telemetry["errors_by_code"] = {}
    return {"success": True}


@eel.expose
def reset_session():
    """Clear the currently loaded document and derived outputs."""
    global current_file, original_text, corrected_text, full_corrected_text
    current_file = None
    original_text = ""
    corrected_text = ""
    full_corrected_text = ""
    return {"success": True}


def _load_text_to_state(file_name: str, text: str):
    """Store loaded text in global app state and return payload."""
    global original_text, corrected_text, full_corrected_text, current_file
    current_file = file_name
    original_text = text
    corrected_text = ""
    full_corrected_text = ""
    return {
        "success": True,
        "text": original_text,
        "word_count": len(original_text.split()),
    }


def _build_process_payload(original: str, corrected: str):
    """Build standard process response payload."""
    return {
        "success": True,
        "text": corrected,
        "original": original,
        "word_count": len(corrected.split()),
        "redline_html": processor.build_redline_html(original, corrected),
        "corrected_annotated_html": processor.build_foreign_annotated_html(corrected),
        "corrections_report": processor.build_corrections_report(original, corrected),
        "noun_report": processor.build_noun_report(corrected),
        "domain_report": processor.get_domain_report(),
        "journal_profile_report": processor.get_journal_profile_report(),
        "citation_reference_report": processor.get_citation_reference_report(),
        "processing_audit": processor.get_processing_audit(),
        "processing_note": getattr(processor, "_last_selection_note", ""),
    }


def _build_download_filename(file_type: str) -> str:
    """Build a friendly output filename based on loaded manuscript name."""
    base_name = os.path.splitext(os.path.basename(current_file or "manuscript"))[0].strip() or "manuscript"
    suffix = "clean" if file_type == "clean" else "highlighted"
    return f"{base_name}_{suffix}.docx"


def _build_fallback_save_path(file_type: str) -> str:
    """Build non-dialog fallback path (prefer ~/Downloads)."""
    candidates = [
        os.path.join(os.path.expanduser("~"), "Downloads"),
        os.getcwd(),
        tempfile.gettempdir(),
    ]
    target_dir = os.getcwd()
    for folder in candidates:
        if os.path.isdir(folder) and os.access(folder, os.W_OK):
            target_dir = folder
            break

    base_name = _build_download_filename(file_type)
    root, ext = os.path.splitext(base_name)
    candidate = os.path.join(target_dir, base_name)
    counter = 1
    while os.path.exists(candidate):
        candidate = os.path.join(target_dir, f"{root}_{counter}{ext}")
        counter += 1
    return candidate


@eel.expose
def load_file(file_path):
    """Load a .txt or .docx file from a local filesystem path."""
    try:
        text, _ = processor.load_document(file_path)
        return _load_text_to_state(os.path.basename(file_path), text)
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def load_text_content(file_name, content):
    """Load plain text content from browser file reader."""
    try:
        return _load_text_to_state(file_name, content)
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def load_docx_content(file_name, base64_data):
    """Load DOCX content from base64 payload."""
    try:
        byte_data = base64.b64decode(base64_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            handle.write(byte_data)
            temp_path = handle.name

        try:
            text, _ = processor.load_document(temp_path)
            return _load_text_to_state(file_name, text)
        finally:
            os.unlink(temp_path)
    except Exception as e:
        return {"success": False, "error": str(e) + "\n" + traceback.format_exc()}


@eel.expose
def process_document(options):
    """Process the currently loaded document with selected options."""
    global original_text, corrected_text, full_corrected_text
    try:
        if not original_text.strip():
            return {"success": False, "error": "No document loaded"}

        full_corrected_text = processor.process_text(original_text, options or {})
        corrected_text = full_corrected_text
        return _build_process_payload(original_text, corrected_text)
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def apply_correction_group_decisions(group_decisions):
    """Apply accept/reject decisions by correction group and refresh preview/export state."""
    global original_text, corrected_text, full_corrected_text
    try:
        if not original_text.strip():
            return {"success": False, "error": "No document loaded"}
        if not full_corrected_text.strip():
            return {"success": False, "error": "No corrected document available"}

        corrected_text = processor.apply_group_decisions(original_text, full_corrected_text, group_decisions or {})
        return _build_process_payload(original_text, corrected_text)
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def get_redline_preview():
    """Get redline HTML for current original and corrected text."""
    global original_text, corrected_text
    try:
        if not original_text.strip():
            return {"success": False, "error": "No document loaded"}
        if not corrected_text.strip():
            return {"success": False, "error": "No corrected document available"}
        return {
            "success": True,
            "redline_html": processor.build_redline_html(original_text, corrected_text),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def get_ollama_models(ollama_host=None):
    """Return detected Ollama models for dropdown population."""
    try:
        host = str(ollama_host or processor.ollama_host).strip() or processor.ollama_host
        models = processor._get_ollama_models(host)
        default_model = processor._resolve_ollama_model(host, processor.model)
        return {
            "success": True,
            "models": models,
            "default_model": default_model,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "models": []}


@eel.expose
def export_file(file_type):
    """Export clean/highlighted DOCX as base64 for browser download."""
    global original_text, corrected_text
    temp_path = None
    runtime_telemetry["export_attempts"] += 1
    try:
        if not corrected_text.strip():
            runtime_telemetry["export_failures"] += 1
            return _error_payload("EXPORT_NO_CORRECTED_DOC", "No corrected document available")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            temp_path = handle.name

        if file_type == "clean":
            processor.generate_clean_docx(corrected_text, temp_path)
        elif file_type in ("highlighted", "redline"):
            processor.generate_highlighted_docx(original_text, corrected_text, temp_path)
        else:
            runtime_telemetry["export_failures"] += 1
            return _error_payload("EXPORT_UNSUPPORTED_TYPE", "Unsupported file type", file_type=str(file_type))

        with open(temp_path, "rb") as infile:
            encoded = base64.b64encode(infile.read()).decode("ascii")

        runtime_telemetry["export_successes"] += 1
        return {
            "success": True,
            "file_name": _build_download_filename(file_type),
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "base64_data": encoded,
        }
    except Exception as e:
        runtime_telemetry["export_failures"] += 1
        return _error_payload("EXPORT_EXCEPTION", str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


@eel.expose
def save_file(file_type):
    """Save clean or highlighted DOCX output."""
    global original_text, corrected_text
    runtime_telemetry["save_attempts"] += 1

    try:
        if not corrected_text.strip():
            runtime_telemetry["save_failures"] += 1
            return _error_payload("SAVE_NO_CORRECTED_DOC", "No corrected document available")

        path = ""
        tk_failed = False
        tk_error = ""

        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            try:
                if file_type == "clean":
                    path = filedialog.asksaveasfilename(
                        title="Save Clean Version",
                        defaultextension=".docx",
                        filetypes=[("Word documents", "*.docx")],
                    )
                else:
                    path = filedialog.asksaveasfilename(
                        title="Save Highlighted Version",
                        defaultextension=".docx",
                        filetypes=[("Word documents", "*.docx")],
                    )
            finally:
                root.destroy()
        except Exception as e:
            tk_failed = True
            tk_error = str(e)

        if not path:
            if not tk_failed:
                runtime_telemetry["save_failures"] += 1
                return _error_payload("SAVE_NO_PATH_SELECTED", "No path selected")
            path = _build_fallback_save_path(file_type)
            runtime_telemetry["save_fallback_used"] += 1

        if file_type == "clean":
            processor.generate_clean_docx(corrected_text, path)
        elif file_type in ("highlighted", "redline"):
            processor.generate_highlighted_docx(original_text, corrected_text, path)
        else:
            runtime_telemetry["save_failures"] += 1
            return _error_payload("SAVE_UNSUPPORTED_TYPE", "Unsupported file type", file_type=str(file_type))

        runtime_telemetry["save_successes"] += 1
        result = {"success": True, "path": path}
        if tk_failed and tk_error:
            result["warning_code"] = "SAVE_DIALOG_UNAVAILABLE_FALLBACK_USED"
            result["note"] = f"Save dialog unavailable; auto-saved to fallback path. ({tk_error})"
        return result
    except Exception as e:
        runtime_telemetry["save_failures"] += 1
        return _error_payload("SAVE_EXCEPTION", str(e))


def main():
    """Main entry point."""
    setup_web_folder()
    eel.init(web_folder)
    eel.start("index.html", size=(1000, 700), port=8000)


if __name__ == "__main__":
    main()

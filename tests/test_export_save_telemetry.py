"""Backend tests for save/export error codes and runtime telemetry."""

import builtins
import os
import tempfile
import unittest

from docx import Document

import main


class ExportSaveTelemetryTests(unittest.TestCase):
    def setUp(self):
        main.reset_runtime_telemetry()
        main.current_file = "sample.docx"
        main.original_text = ""
        main.corrected_text = ""

    def test_export_without_corrected_text_returns_error_code(self):
        response = main.export_file("clean")
        self.assertFalse(response["success"])
        self.assertEqual(response.get("error_code"), "EXPORT_NO_CORRECTED_DOC")

        telemetry = main.get_runtime_telemetry()["telemetry"]
        self.assertEqual(telemetry["export_attempts"], 1)
        self.assertEqual(telemetry["export_failures"], 1)
        self.assertEqual(telemetry["errors_by_code"].get("EXPORT_NO_CORRECTED_DOC"), 1)

    def test_export_success_updates_telemetry(self):
        main.original_text = "Hello world."
        main.corrected_text = "Hello, world."
        response = main.export_file("clean")
        self.assertTrue(response["success"])
        self.assertIn("base64_data", response)
        self.assertEqual(response["file_name"], "clean_sample.docx")

        telemetry = main.get_runtime_telemetry()["telemetry"]
        self.assertEqual(telemetry["export_attempts"], 1)
        self.assertEqual(telemetry["export_successes"], 1)
        self.assertEqual(telemetry["export_failures"], 0)

    def test_highlighted_export_uses_prefixed_filename(self):
        main.original_text = "Hello world."
        main.corrected_text = "Hello, world."
        response = main.export_file("highlighted")
        self.assertTrue(response["success"])
        self.assertEqual(response["file_name"], "highlighted_sample.docx")

    def test_highlighted_docx_uses_red_change_text(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            output_path = handle.name

        try:
            main.processor.generate_highlighted_docx("old text", "new text", output_path)
            doc = Document(output_path)
            runs = [run for paragraph in doc.paragraphs for run in paragraph.runs if run.text.strip()]

            deleted_runs = [run for run in runs if run.font.strike]
            inserted_runs = [run for run in runs if run.font.underline]

            self.assertTrue(deleted_runs)
            self.assertTrue(inserted_runs)
            self.assertEqual(str(deleted_runs[0].font.color.rgb), "C80000")
            self.assertEqual(str(inserted_runs[0].font.color.rgb), "C80000")
            self.assertIsNone(deleted_runs[0].font.highlight_color)
            self.assertIsNone(inserted_runs[0].font.highlight_color)
        finally:
            os.unlink(output_path)

    def test_highlighted_docx_does_not_mark_shifted_unchanged_paragraphs_red(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            output_path = handle.name

        original = (
            "First paragraph stays.\n"
            "Second paragraph gets revised.\n"
            "Third paragraph stays the same."
        )
        corrected = (
            "First paragraph stays.\n"
            "A newly inserted paragraph appears here.\n"
            "Second paragraph gets revised carefully.\n"
            "Third paragraph stays the same."
        )

        try:
            main.processor.generate_highlighted_docx(original, corrected, output_path)
            doc = Document(output_path)
            target = next(paragraph for paragraph in doc.paragraphs if paragraph.text == "Third paragraph stays the same.")
            self.assertTrue(target.runs)
            self.assertFalse(any(run.font.strike for run in target.runs))
            self.assertFalse(any(run.font.underline for run in target.runs))
            self.assertFalse(any(str(run.font.color.rgb) == "C80000" for run in target.runs if run.font.color.rgb))
        finally:
            os.unlink(output_path)

    def test_clean_docx_renders_missing_placeholders_in_gray(self):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as handle:
            output_path = handle.name

        try:
            main.processor.generate_clean_docx("Reference [place missing]", output_path)
            doc = Document(output_path)
            runs = [run for paragraph in doc.paragraphs for run in paragraph.runs if run.text.strip()]

            placeholder_run = next(run for run in runs if run.text == "[place missing]")
            self.assertEqual(str(placeholder_run.font.color.rgb), "808080")
        finally:
            os.unlink(output_path)

    def test_save_without_corrected_text_returns_error_code(self):
        response = main.save_file("clean")
        self.assertFalse(response["success"])
        self.assertEqual(response.get("error_code"), "SAVE_NO_CORRECTED_DOC")

        telemetry = main.get_runtime_telemetry()["telemetry"]
        self.assertEqual(telemetry["save_attempts"], 1)
        self.assertEqual(telemetry["save_failures"], 1)
        self.assertEqual(telemetry["errors_by_code"].get("SAVE_NO_CORRECTED_DOC"), 1)

    def test_save_uses_fallback_when_tkinter_missing(self):
        main.original_text = "Hello world."
        main.corrected_text = "Hello, world."

        orig_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "tkinter" or name.startswith("tkinter"):
                raise ModuleNotFoundError("No module named 'tkinter'")
            return orig_import(name, *args, **kwargs)

        builtins.__import__ = fake_import
        try:
            response = main.save_file("clean")
        finally:
            builtins.__import__ = orig_import

        self.assertTrue(response["success"])
        self.assertIn("path", response)
        self.assertTrue(os.path.exists(response["path"]))
        self.assertEqual(response.get("warning_code"), "SAVE_DIALOG_UNAVAILABLE_FALLBACK_USED")

        telemetry = main.get_runtime_telemetry()["telemetry"]
        self.assertEqual(telemetry["save_attempts"], 1)
        self.assertEqual(telemetry["save_successes"], 1)
        self.assertEqual(telemetry["save_fallback_used"], 1)

        os.unlink(response["path"])


if __name__ == "__main__":
    unittest.main()

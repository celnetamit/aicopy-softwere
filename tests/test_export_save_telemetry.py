"""Backend tests for save/export error codes and runtime telemetry."""

import builtins
import os
import unittest

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
        self.assertTrue(response["file_name"].endswith("_clean.docx"))

        telemetry = main.get_runtime_telemetry()["telemetry"]
        self.assertEqual(telemetry["export_attempts"], 1)
        self.assertEqual(telemetry["export_successes"], 1)
        self.assertEqual(telemetry["export_failures"], 0)

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

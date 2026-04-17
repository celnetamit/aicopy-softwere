"""Regression coverage for critical manuscript formatting rules."""

import re
import unittest

from chicago_editor import ChicagoEditor
from document_processor import DocumentProcessor


class ChicagoEditorRegressionTests(unittest.TestCase):
    def setUp(self):
        self.editor = ChicagoEditor()

    def test_mixed_parenthetical_citation_collapses_to_numeric(self):
        source = "Stress increased (Kaplan, 1995 [9] Ulrich et al., 1991) [19]."
        fixed = self.editor.apply_chicago_style(source, {})
        self.assertIn("[9, 19]", fixed)
        self.assertNotIn("(Kaplan, 1995 [9]", fixed)

    def test_author_line_markers_normalized_to_superscript(self):
        source = (
            "Ar. Jasmine Ahluwalia, two. Dr. Kuldeep Kumar*, "
            "three. Ar. Luvditya Khurana, four. Ar. Varish Panchal"
        )
        normalized = self.editor.apply_chicago_style(source, {})
        self.assertIn("Jasmine Ahluwalia", normalized)
        self.assertIn("Kuldeep Kumar²*", normalized)
        self.assertIn("Luvditya Khurana³", normalized)
        self.assertIn("Varish Panchal⁴", normalized)
        self.assertNotIn("Dr.", normalized)
        self.assertNotIn("Ar.", normalized)

    def test_references_follow_first_appearance_order(self):
        source = (
            "Discussion cites [3] before [1].\n"
            "References\n"
            "Zulu Z. zulu title. Journal of Testing. 2020;1(1):1-2.\n"
            "Alpha A. alpha title. Journal of Testing. 2019;1(1):3-4.\n"
            "Gamma G. gamma title. Journal of Testing. 2021;1(1):5-6.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        lines = [line.strip() for line in out.splitlines() if line.strip()]
        self.assertEqual(lines[0], "Discussion cites [1] before [2].")
        self.assertEqual(lines[2][:10], "[1] Gamma ")
        self.assertEqual(lines[3][:9], "[2] Zulu ")
        self.assertEqual(lines[4][:10], "[3] Alpha ")

    def test_uncited_references_append_after_cited_set(self):
        source = (
            "Body cites [2].\n"
            "References\n"
            "[1] Alpha AB. alpha title. Journal of Testing. 2019;1(1):3-4.\n"
            "[2] Beta CD. beta title. Journal of Testing. 2020;1(1):1-2.\n"
            "[3] Gamma EF. gamma title. Journal of Testing. 2021;1(1):5-6.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        lines = [line.strip() for line in out.splitlines() if line.strip()]
        self.assertEqual(lines[0], "Body cites [1].")
        self.assertEqual(lines[2][:9], "[1] Beta ")
        self.assertEqual(lines[3][:10], "[2] Alpha ")
        self.assertEqual(lines[4][:10], "[3] Gamma ")

    def test_urls_and_doi_are_protected_from_rewrite(self):
        source = (
            "Visit HTTPS://Example.COM/Path?q=OneTwo and DOI:10.1000/ABCdEf for details."
        )
        out = self.editor.correct_all(
            source,
            {
                "spelling": True,
                "sentence_case": True,
                "punctuation": True,
                "chicago_style": True,
            },
        )
        self.assertIn("HTTPS://Example.COM/Path?q=OneTwo", out)
        self.assertIn("DOI:10.1000/ABCdEf", out)

    def test_reference_profile_initial_periods_rule_changes_author_initials(self):
        source = (
            "References\n"
            "Smith AB, Doe CD. sample title. Journal of Testing. 2024;10(2):100-110.\n"
        )
        no_periods = self.editor.format_references_vancouver_numbered(
            source,
            {"journal_profile": "vancouver_nlm"},
        )
        with_periods = self.editor.format_references_vancouver_numbered(
            source,
            {"journal_profile": "vancouver_periods"},
        )
        self.assertIn("Smith AB, Doe CD", no_periods)
        self.assertIn("Smith A.B., Doe C.D.", with_periods)

    def test_reference_profile_full_journal_names_are_preserved(self):
        source = (
            "References\n"
            "Alpha AB. sample title. Journal of Architectural Research. 2020;1(1):1-2.\n"
        )
        abbreviated = self.editor.format_references_vancouver_numbered(
            source,
            {"journal_profile": "vancouver_nlm"},
        )
        full = self.editor.format_references_vancouver_numbered(
            source,
            {"journal_profile": "vancouver_full"},
        )
        self.assertIn("J Archit Res", abbreviated)
        self.assertIn("Journal of Architectural Research", full)

    def test_reference_profile_validation_messages_are_profile_aware(self):
        source = (
            "References\n"
            "[1] Smith AB, Doe CD. sample title. Journal of Testing. 2024;10(2):100-110.\n"
        )
        report = self.editor.build_reference_profile_report(
            source,
            {"journal_profile": "vancouver_periods"},
        )
        messages = [str(item).lower() for item in report.get("validation_messages", [])]
        self.assertEqual(report.get("profile_id"), "vancouver_periods")
        self.assertGreater(report.get("reference_count", 0), 0)
        self.assertTrue(any("period" in msg for msg in messages))

    def test_citation_reference_validator_catches_seeded_issues(self):
        source = (
            "Introduction cites [1, 1] and has malformed [2 text.\n"
            "Another statement cites [4].\n"
            "References\n"
            "[1] Alpha AB. Complete entry. J Test. 2024;10(2):100-110. doi:10.1000/alpha.\n"
            "[2] Beta CD. Incomplete entry without required metadata.\n"
            "[3] Gamma EF. Another incomplete entry. J Test.\n"
        )
        report = self.editor.build_citation_reference_validator_report(source, {})
        counts = report.get("category_counts", {})
        self.assertGreaterEqual(int(counts.get("duplicate_citation_numbers_in_block", 0)), 1)
        self.assertGreaterEqual(int(counts.get("malformed_bracket_unclosed", 0)), 1)
        self.assertGreaterEqual(int(counts.get("citation_missing_reference", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_year", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_volume", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_pages", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_doi", 0)), 1)

    def test_citation_reference_validator_clean_sample_is_stable(self):
        source = (
            "Introduction cites [1, 2].\n"
            "Discussion cites [2].\n"
            "References\n"
            "[1] Alpha AB. Complete title. J Test. 2024;10(2):100-110. doi:10.1000/alpha.\n"
            "[2] Beta CD. Another title. J Test. 2023;9(1):90-99. doi:10.1000/beta.\n"
        )
        report = self.editor.build_citation_reference_validator_report(source, {})
        self.assertEqual(report.get("summary", {}).get("total_issues"), 0)
        self.assertEqual(report.get("messages"), [])


class ProcessorRegressionTests(unittest.TestCase):
    def test_redline_highlights_only_changed_tokens(self):
        processor = DocumentProcessor()
        html = processor.build_redline_html("Hello world.", "Hello brave world.")
        self.assertRegex(html, r'<span class="redline-add">\s*brave\s*</span>')
        self.assertNotIn('<span class="redline-del">Hello world.</span>', html)

    def test_process_text_rule_mode_sets_expected_note(self):
        processor = DocumentProcessor()
        result = processor.process_text(
            "keywords: BIOPHILIC DESIGN, interior design",
            {
                "spelling": True,
                "sentence_case": True,
                "punctuation": True,
                "chicago_style": True,
                "ai": {"enabled": False},
            },
        )
        self.assertIn("Keyword:", result)
        self.assertEqual(processor._last_selection_note, "Rule-based correction applied.")

    def test_processor_exposes_journal_profile_report_for_selected_profile(self):
        processor = DocumentProcessor()
        _ = processor.process_text(
            "References\nSmith AB, Doe CD. sample title. Journal of Testing. 2024;10(2):100-110.\n",
            {
                "spelling": True,
                "sentence_case": True,
                "punctuation": True,
                "chicago_style": True,
                "journal_profile": "vancouver_periods",
                "ai": {"enabled": False},
            },
        )
        report = processor.get_journal_profile_report()
        self.assertEqual(report.get("profile_id"), "vancouver_periods")
        self.assertGreaterEqual(report.get("reference_count", 0), 1)

    def test_processor_exposes_citation_reference_report(self):
        processor = DocumentProcessor()
        _ = processor.process_text(
            (
                "Introduction cites [7].\n"
                "References\n"
                "[1] Alpha AB. Complete title. J Test. 2024;10(2):100-110. doi:10.1000/alpha.\n"
            ),
            {
                "spelling": True,
                "sentence_case": True,
                "punctuation": True,
                "chicago_style": True,
                "ai": {"enabled": False},
            },
        )
        report = processor.get_citation_reference_report()
        self.assertGreater(report.get("summary", {}).get("total_issues", 0), 0)
        self.assertGreater(int(report.get("category_counts", {}).get("citation_missing_reference", 0)), 0)

    def test_apply_group_decisions_accepts_and_rejects_by_group(self):
        processor = DocumentProcessor()
        original = "\n".join([
            "helo",
            "This cites [1] [1].",
            "References",
            "[1] Smth A. bad title. Journal of Testing. 2024;1(1):1-2.",
        ])
        corrected = "\n".join([
            "hello",
            "This cites [1].",
            "References",
            "[1] Smith AB. Bad title. J Test. 2024;1(1):1-2.",
        ])

        partially_rejected = processor.apply_group_decisions(
            original,
            corrected,
            {
                "spelling": False,
                "citation": False,
                "reference": True,
            },
        )
        self.assertIn("helo", partially_rejected)
        self.assertIn("This cites [1] [1].", partially_rejected)
        self.assertIn("[1] Smith AB. Bad title. J Test.", partially_rejected)

        all_accepted = processor.apply_group_decisions(
            original,
            corrected,
            {key: True for key in ("spelling", "capitalization", "punctuation", "citation", "reference", "style")},
        )
        self.assertEqual(all_accepted, corrected)


if __name__ == "__main__":
    unittest.main()

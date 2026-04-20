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

    def test_default_reference_profile_uses_initial_periods(self):
        source = (
            "References\n"
            "Smith AB. sample title. Journal of Architectural Research. 2024;10(2):100-110.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertIn("Smith A.B.", out)
        self.assertIn("J Archit Res", out)

    def test_reference_author_list_over_six_collapses_to_first_author_et_al(self):
        source = (
            "References\n"
            "Smith AB, Doe CD, Lee EF, Kumar GH, Patel IJ, Brown KL, Green MN. sample title. Journal of Testing. 2024;10(2):100-110.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertIn("Smith A.B., et al.", out)
        self.assertNotIn("Doe C.D.", out)

    def test_reference_tail_uses_house_journal_pattern(self):
        source = (
            "References\n"
            "Nooreldeen R, Bach H. Current and future development in lung cancer diagnosis. International Journal of Molecular Sciences. 2021 Aug 12;22(16):8661. doi:10.3390/ijms22168661.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertIn("Nooreldeen R., Bach H.", out)
        self.assertIn("Int J Mol Sci. 2021 ;22(16):8661. doi: 10.3390/ijms22168661.", out)

    def test_apa_style_journal_reference_is_parsed_without_false_missing_placeholders(self):
        source = (
            "References\n"
            "Kaplan S. (1995). The restorative benefits of nature: Toward an integrative framework. Journal of Environmental Psychology, 15(3), 169–182.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertIn("Kaplan S.", out)
        self.assertIn("The restorative benefits of nature: toward an integrative framework.", out)
        self.assertIn("J Environ Psychol. 1995 ;15(3):169–182.", out)
        self.assertNotIn("[title missing]", out)
        self.assertNotIn("[volume missing]", out)
        self.assertNotIn("[page missing]", out)

    def test_author_year_website_reference_keeps_title_and_url_without_false_place_publisher_missing(self):
        source = (
            "References\n"
            "Kellert S. R., & Calabrese, E. F. 2015; The practice of biophilic design. www.biophilic-design.com\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertIn("The practice of biophilic design", out)
        self.assertIn("www.biophilic-design.com", out)
        self.assertNotIn("[title missing]", out)
        self.assertNotIn("[place missing]", out)
        self.assertNotIn("[publisher missing]", out)

    def test_in_chapter_reference_is_not_misclassified_as_journal_volume_missing(self):
        source = (
            "References\n"
            "Wilson E.O. Biophilia and the conservation ethic. In Evolutionary Perspectives Environ Problems. 2017;(pp. 250-258). Routledge.\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertIn("Biophilia and the conservation ethic", out)
        self.assertNotIn("[volume missing]", out)

    def test_citation_reference_validator_is_source_type_aware(self):
        source = (
            "Introduction cites [1, 2, 3].\n"
            "References\n"
            "[1] Smith AB, Johnson CD, Lee EF, et al. The role of nanoparticles in drug delivery. J Med Chem. 2021;64(2):123-131.\n"
            "[2] Moore JC. Introduction to Biochemistry. 3rd ed. New York: Academic Press; 2020.\n"
            "[3] National Institutes of Health. Cancer treatment [Internet]. Bethesda (MD): NIH; 2022 [cited 2023 Jan 15]. Available from: https://www.cancer.gov\n"
        )
        report = self.editor.build_citation_reference_validator_report(source, {})
        self.assertEqual(report.get("summary", {}).get("total_issues"), 0)
        self.assertEqual(report.get("messages"), [])

    def test_citation_reference_validator_catches_seeded_issues(self):
        source = (
            "Introduction cites [1, 1] and has malformed [2 text.\n"
            "Another statement cites [6].\n"
            "References\n"
            "[1] Alpha AB. Complete entry. J Test. 2024;10(2):100-110.\n"
            "[2] Beta CD. Incomplete journal entry. J Test.\n"
            "[3] Gamma EF. Another incomplete journal entry. J Test. 2024.\n"
            "[4] Moore JC. Introduction to Biochemistry. Academic Press; 2020.\n"
        )
        report = self.editor.build_citation_reference_validator_report(source, {})
        counts = report.get("category_counts", {})
        self.assertGreaterEqual(int(counts.get("duplicate_citation_numbers_in_block", 0)), 1)
        self.assertGreaterEqual(int(counts.get("malformed_bracket_unclosed", 0)), 1)
        self.assertGreaterEqual(int(counts.get("citation_missing_reference", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_year", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_volume", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_pages", 0)), 1)
        self.assertGreaterEqual(int(counts.get("reference_missing_place", 0)), 1)

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

    def test_source_type_missing_placeholders_are_injected(self):
        source = (
            "References\n"
            "Moore JC. Introduction to Biochemistry. Academic Press; 2020.\n"
            "National Institutes of Health. Cancer treatment [Internet]. Bethesda (MD): NIH; 2022. Available from: https://www.cancer.gov\n"
        )
        out = self.editor.format_references_vancouver_numbered(source, {})
        self.assertRegex(out, r"\[place missing\]\s*:\s*Academic Press;\s*2020")
        self.assertRegex(out, r"2022\s*\[cited date missing\]\.\s*Available from:")


class ProcessorRegressionTests(unittest.TestCase):
    def test_redline_highlights_only_changed_tokens(self):
        processor = DocumentProcessor()
        html = processor.build_redline_html("Hello world.", "Hello brave world.")
        self.assertRegex(html, r'<span class="redline-add">\s*brave\s*</span>')
        self.assertNotIn('<span class="redline-del">Hello world.</span>', html)

    def test_foreign_annotated_html_wraps_missing_placeholders(self):
        processor = DocumentProcessor()
        html = processor.build_foreign_annotated_html("Reference [page missing]")
        self.assertIn('<span class="missing-placeholder">[page missing]</span>', html)

    def test_foreign_annotated_html_italics_known_foreign_terms(self):
        processor = DocumentProcessor()
        html = processor.build_foreign_annotated_html("Study was done in vitro and in vivo.")
        self.assertIn('<em class="foreign-term">in vitro</em>', html)
        self.assertIn('<em class="foreign-term">in vivo</em>', html)

    def test_foreign_annotated_html_skips_url_and_email_literals(self):
        processor = DocumentProcessor()
        html = processor.build_foreign_annotated_html(
            "Use ibid in text. URL https://example.com/ibid Email ibid@example.com"
        )
        self.assertEqual(html.count('<em class="foreign-term">ibid</em>'), 1)

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

    def test_cmos_guardrails_added_to_processing_audit_summary(self):
        processor = DocumentProcessor()
        _ = processor.process_text(
            "This legal contract shall be interpreted as follows.\nReferences\n[1] Example AB. sample title. J Test. 2024;10(2):100-110.\n",
            {
                "spelling": True,
                "sentence_case": True,
                "punctuation": True,
                "chicago_style": True,
                "cmos_strict_mode": True,
                "domain_profile": "auto",
                "custom_terms": [],
                "ai": {"enabled": False},
            },
        )
        audit = processor.get_processing_audit()
        summary = audit.get("summary", {})
        guardrails = summary.get("cmos_guardrails", {})
        self.assertTrue(guardrails.get("strict_mode"))
        self.assertIn("status", guardrails)
        self.assertIn("warnings", guardrails)
        self.assertIn("recommendations", guardrails)
        self.assertEqual(guardrails.get("requested_domain"), "auto")

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

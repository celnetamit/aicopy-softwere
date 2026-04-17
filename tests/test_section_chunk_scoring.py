"""Tests for Week 3 section chunk scoring and per-section decision logging."""

import re
import unittest

from document_processor import DocumentProcessor


def _extract_between(prompt: str, start: str, end: str) -> str:
    if start not in prompt:
        return ""
    tail = prompt.split(start, 1)[1]
    if end in tail:
        return tail.split(end, 1)[0]
    return tail


class SectionChunkScoringTests(unittest.TestCase):
    def test_section_audit_contains_scores_and_decisions(self):
        processor = DocumentProcessor()

        def fake_invoke(prompt, _settings):
            section_match = re.search(r"This is section (\d+) of (\d+)", prompt)
            if section_match:
                idx = int(section_match.group(1))
                baseline = _extract_between(
                    prompt,
                    "Baseline corrected draft (already rule-checked):\n",
                    "\n\nCorrected manuscript:",
                )
                # Force fallback on even chunks; accept on odd chunks.
                if idx % 2 == 0:
                    return ""
                return baseline

            if "Final consistent manuscript:" in prompt:
                return _extract_between(prompt, "Manuscript:\n", "\n\nFinal consistent manuscript:")

            return _extract_between(
                prompt,
                "Baseline corrected draft (already rule-checked):\n",
                "\n\nCorrected manuscript:",
            )

        processor._invoke_ai_provider = fake_invoke  # type: ignore

        sample_lines = [
            f"Line {i}. This section has citation [1] and url https://example.com/{i}."
            for i in range(1, 80)
        ]
        manuscript = "\n".join(sample_lines)
        options = {
            "spelling": True,
            "sentence_case": True,
            "punctuation": True,
            "chicago_style": True,
            "ai": {
                "enabled": True,
                "provider": "ollama",
                "section_wise": True,
                "section_threshold_chars": 1000,
                "section_threshold_paragraphs": 20,
                "section_chunk_chars": 420,
                "section_chunk_lines": 8,
                "global_consistency_max_chars": 20000,
            },
        }

        _ = processor.process_text(manuscript, options)
        audit = processor.get_processing_audit()

        self.assertEqual(audit.get("mode"), "sectioned")
        summary = audit.get("summary", {})
        sections = audit.get("sections", [])
        self.assertGreater(summary.get("total_sections", 0), 1)
        self.assertEqual(len(sections), summary.get("total_sections"))
        self.assertGreater(summary.get("accepted_sections", 0), 0)
        self.assertGreater(summary.get("fallback_sections", 0), 0)
        self.assertEqual(summary.get("section_tolerance"), 4)
        self.assertEqual(summary.get("consistency_tolerance"), 3)
        self.assertIsNotNone(summary.get("average_baseline_quality"))
        self.assertIsNotNone(summary.get("average_ai_quality"))
        fallback_reasons = summary.get("fallback_reason_counts", {})
        self.assertGreater(fallback_reasons.get("empty_ai_output", 0), 0)

        consistency = summary.get("consistency", {})
        self.assertTrue(consistency.get("ran"))
        self.assertIn(consistency.get("decision"), ("accepted", "fallback"))
        self.assertIn("quality_delta", consistency)

        for item in sections:
            self.assertIn(item.get("decision"), ("accepted", "fallback"))
            self.assertIn("baseline_score", item)
            self.assertIn("baseline_quality", item)
            self.assertIn("baseline_risk", item)
            self.assertIn("decision_reason", item)
            self.assertIn("decision_confidence", item)
            self.assertIn("line_start", item)
            self.assertIn("line_end", item)


if __name__ == "__main__":
    unittest.main()

"""Document processing, AI editing, and DOCX generation."""

import os
import re
import json
import difflib
import html
import subprocess
import requests
from typing import Tuple, List, Dict, Optional, Set
from collections import Counter
from docx import Document
from docx.shared import RGBColor, Pt, Inches
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from chicago_editor import ChicagoEditor


class DocumentProcessor:
    """Handles document loading, AI processing, and DOCX output."""

    MISSING_PLACEHOLDER_COLOR = RGBColor(128, 128, 128)

    def __init__(self, ollama_host: str = "http://localhost:11434"):
        self.ollama_host = ollama_host
        self.editor = ChicagoEditor()
        self.model = "llama3.1"
        self.gemini_model = "gemini-1.5-flash"
        self.openrouter_model = "openrouter/auto"
        self.agent_router_model = "openrouter/auto"
        self._last_ai_warning = ""
        self._last_selection_note = ""
        self._last_ai_pipeline_note = ""
        self._last_chunk_decisions: List[Dict] = []
        self._last_processing_audit: Dict = {}
        self._last_journal_profile_report: Dict = {}
        self._last_citation_reference_report: Dict = {}
        self._nlp = None

    def _reset_processing_audit(self):
        """Reset per-run audit data."""
        self._last_chunk_decisions = []
        self._last_processing_audit = {
            "mode": "rule_only",
            "sections": [],
            "summary": {},
        }
        self._last_journal_profile_report = {}
        self._last_citation_reference_report = {}

    def _quality_score(self, risk_score: Optional[int]) -> int:
        """Convert risk score (lower is better) into quality score (0-100)."""
        if risk_score is None:
            return 0
        return max(0, 100 - min(100, int(risk_score)))

    def _risk_label(self, risk_score: Optional[int]) -> str:
        """Return label for risk score."""
        if risk_score is None:
            return "unknown"
        score = int(risk_score)
        if score <= 8:
            return "low"
        if score <= 25:
            return "medium"
        return "high"

    def load_document(self, path: str) -> Tuple[str, str]:
        """Load document and return (text, format)."""
        ext = os.path.splitext(path)[1].lower()

        if ext == '.txt':
            with open(path, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read()
            return text, 'txt'

        elif ext == '.docx':
            doc = Document(path)
            text_parts = []
            for para in doc.paragraphs:
                text_parts.append(para.text)
            text = '\n'.join(text_parts)
            return text, 'docx'

        else:
            raise ValueError(f"Unsupported file format: {ext}")

    def process_text(self, text: str, options: Dict) -> str:
        """Process text using AI with Chicago style rules."""
        self._last_selection_note = ""
        self._last_ai_pipeline_note = ""
        self._reset_processing_audit()

        # First apply rule-based corrections
        rules_corrected = self.editor.correct_all(text, options)

        # Then enhance with AI for context-aware corrections
        ai_corrected = self._call_ai_editor(text, rules_corrected, options)
        if ai_corrected:
            # Enforce deterministic house rules after AI so citation/author formats stay correct.
            ai_post_processed = self.editor.correct_all(ai_corrected, options)
            selected = self._select_best_correction(
                original=text,
                rules_corrected=rules_corrected,
                ai_corrected=ai_post_processed
            )
            if self._last_ai_pipeline_note:
                self._last_selection_note = f"{self._last_ai_pipeline_note} {self._last_selection_note}".strip()
            self._last_journal_profile_report = self.editor.build_reference_profile_report(selected, options)
            self._last_citation_reference_report = self.editor.build_citation_reference_validator_report(selected, options)
            return selected

        if self._last_ai_pipeline_note:
            self._last_selection_note = self._last_ai_pipeline_note
        else:
            self._last_selection_note = "Rule-based correction applied."
        if self._last_processing_audit.get("mode") == "full":
            self._last_processing_audit["summary"] = {"reason": "AI full-pass returned no usable output"}
        else:
            self._last_processing_audit["mode"] = "rule_only"
            self._last_processing_audit["summary"] = {"reason": "AI disabled or unavailable"}
        self._last_journal_profile_report = self.editor.build_reference_profile_report(rules_corrected, options)
        self._last_citation_reference_report = self.editor.build_citation_reference_validator_report(rules_corrected, options)
        return rules_corrected

    def _call_ai_editor(self, original: str, rules_corrected: str, options: Dict) -> Optional[str]:
        """Call the configured AI provider for enhanced editing."""
        settings = self._get_ai_settings(options)
        if not settings["enabled"]:
            self._last_processing_audit["mode"] = "rule_only"
            self._last_processing_audit["summary"] = {"reason": "AI disabled in settings"}
            return None

        if self._should_use_section_analysis(original, rules_corrected, options):
            return self._call_ai_editor_sectioned(original, rules_corrected, options, settings)

        self._last_processing_audit["mode"] = "full"
        prompt = self._build_edit_prompt(original, rules_corrected, options, stage="full")
        return self._invoke_ai_provider(prompt, settings)

    def _invoke_ai_provider(self, prompt: str, settings: Dict) -> Optional[str]:
        """Dispatch AI request to configured provider."""
        if settings["provider"] == "gemini":
            return self._call_gemini_editor(prompt, settings)
        if settings["provider"] in ("openrouter", "agent_router"):
            return self._call_openrouter_editor(prompt, settings)
        return self._call_ollama_editor(prompt, settings)

    def _should_use_section_analysis(self, original: str, rules_corrected: str, options: Dict) -> bool:
        """Decide whether manuscript should be processed section-wise."""
        ai_options = options.get("ai", {}) if isinstance(options, dict) else {}
        if not isinstance(ai_options, dict):
            ai_options = {}

        if ai_options.get("section_wise") is False:
            return False

        source = rules_corrected or original or ""
        threshold_chars = ai_options.get("section_threshold_chars", 12000)
        threshold_paragraphs = ai_options.get("section_threshold_paragraphs", 90)
        try:
            threshold_chars = max(4000, int(threshold_chars))
        except Exception:
            threshold_chars = 12000
        try:
            threshold_paragraphs = max(20, int(threshold_paragraphs))
        except Exception:
            threshold_paragraphs = 90

        paragraph_count = source.count('\n') + 1
        return len(source) > threshold_chars or paragraph_count > threshold_paragraphs

    def _is_major_heading_line(self, line: str) -> bool:
        """Heuristic heading detection used to keep chunk boundaries semantically clean."""
        value = (line or "").strip()
        if not value:
            return False
        if re.fullmatch(
            r'(?i)(abstract|introduction|background|method(?:s|ology)?|results?|discussion|conclusion|references?)',
            value
        ):
            return True
        if len(value) < 110 and value == value.upper() and re.search(r'[A-Z]', value):
            return True
        if len(value) < 95 and re.fullmatch(r'[A-Z][A-Za-z0-9,&:()\'’\-./ ]*', value) and not re.search(r'[.!?]$', value):
            return True
        return False

    def _split_for_section_analysis(
        self,
        original: str,
        rules_corrected: str,
        options: Dict
    ) -> List[Dict]:
        """Split manuscript into aligned sections for long-context processing."""
        ai_options = options.get("ai", {}) if isinstance(options, dict) else {}
        if not isinstance(ai_options, dict):
            ai_options = {}

        max_chars = ai_options.get("section_chunk_chars", 5500)
        max_lines = ai_options.get("section_chunk_lines", 28)
        try:
            max_chars = max(1800, int(max_chars))
        except Exception:
            max_chars = 5500
        try:
            max_lines = max(8, int(max_lines))
        except Exception:
            max_lines = 28

        orig_lines = (original or "").split('\n')
        base_lines = (rules_corrected or "").split('\n')
        line_count = max(len(orig_lines), len(base_lines))

        if line_count == 0:
            return []

        heading_re = re.compile(r'^\s*references?\s*:?\s*$', flags=re.IGNORECASE)
        section_break_re = re.compile(
            r'^\s*(?:appendix|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|author\s+contributions?)\s*:?\s*$',
            flags=re.IGNORECASE
        )

        chunks: List[Dict] = []
        bucket: List[Tuple[str, str]] = []
        bucket_start = 0
        bucket_chars = 0
        in_references = False

        def flush(end_index: int):
            nonlocal bucket, bucket_start, bucket_chars
            if not bucket:
                return
            chunks.append({
                "index": len(chunks) + 1,
                "line_start": bucket_start + 1,
                "line_end": end_index + 1,
                "original": '\n'.join(item[0] for item in bucket),
                "baseline": '\n'.join(item[1] for item in bucket),
            })
            bucket = []
            bucket_chars = 0

        for i in range(line_count):
            orig_line = orig_lines[i] if i < len(orig_lines) else ""
            base_line = base_lines[i] if i < len(base_lines) else ""
            check_line = (base_line or orig_line).strip()

            if heading_re.match(check_line):
                in_references = True
            elif in_references and section_break_re.match(check_line):
                in_references = False

            line_len = max(len(orig_line), len(base_line)) + 1
            should_split = False
            if bucket:
                too_big = (bucket_chars + line_len > max_chars) or (len(bucket) >= max_lines)
                heading_boundary = self._is_major_heading_line(check_line) and len(bucket) >= 6
                if not in_references and (too_big or heading_boundary):
                    should_split = True

            if should_split:
                flush(i - 1)
                bucket_start = i

            if not bucket:
                bucket_start = i

            bucket.append((orig_line, base_line))
            bucket_chars += line_len

        flush(line_count - 1)
        return chunks

    def _choose_candidate(
        self,
        original: str,
        baseline: str,
        ai_candidate: str,
        tolerance: int = 3,
        stage: str = "section",
    ) -> Tuple[str, bool, Dict]:
        """Choose safer text between baseline and AI candidate using risk scoring."""
        base_score, base_reasons = self._candidate_risk_score(original, baseline)
        detail: Dict = {
            "stage": stage,
            "tolerance": max(0, int(tolerance)),
            "baseline_score": base_score,
            "baseline_reasons": base_reasons,
            "baseline_quality": self._quality_score(base_score),
            "baseline_risk": self._risk_label(base_score),
            "ai_score": None,
            "ai_reasons": [],
            "ai_quality": 0,
            "ai_risk": "unknown",
            "score_delta": None,
            "score_margin": None,
            "decision": "fallback",
            "decision_reason": "empty ai output",
            "decision_confidence": "low",
            "accepted_ai": False,
        }

        if not (ai_candidate or "").strip():
            return baseline, False, detail

        ai_score, ai_reasons = self._candidate_risk_score(original, ai_candidate)
        detail["ai_score"] = ai_score
        detail["ai_reasons"] = ai_reasons
        detail["ai_quality"] = self._quality_score(ai_score)
        detail["ai_risk"] = self._risk_label(ai_score)
        detail["score_delta"] = ai_score - base_score
        detail["score_margin"] = (base_score + detail["tolerance"]) - ai_score

        if ai_score <= base_score + max(0, int(tolerance)):
            detail["decision"] = "accepted"
            detail["decision_reason"] = f"ai score {ai_score} <= baseline {base_score} + tolerance {detail['tolerance']}"
            detail["decision_confidence"] = "high" if ai_score <= base_score else "medium"
            detail["accepted_ai"] = True
            return ai_candidate, True, detail

        detail["decision"] = "fallback"
        detail["decision_reason"] = f"ai score {ai_score} > baseline {base_score} + tolerance {detail['tolerance']}"
        detail["decision_confidence"] = "high" if (detail["score_margin"] or 0) < -8 else "medium"
        return baseline, False, detail

    def _build_consistency_prompt(self, manuscript_text: str, options: Dict) -> str:
        """Build a lightweight global consistency prompt over already corrected text."""
        requested_domain = str(options.get('domain_profile', 'auto')).strip().lower()
        detected_domain = self.get_domain_report().get("profile", "general")
        domain_for_prompt = detected_domain if requested_domain == "auto" else requested_domain
        if domain_for_prompt not in ("general", "medical", "engineering", "law"):
            domain_for_prompt = "general"

        journal_profile = self.editor.resolve_journal_profile(options)
        initials_rule = "without periods (Smith AB)" if not bool(journal_profile.get("initials_with_periods")) else "with periods (Smith A.B.)"
        title_rule = "sentence case" if str(journal_profile.get("title_case", "sentence")) == "sentence" else "title case"
        journal_rule = "NLM abbreviations" if str(journal_profile.get("journal_abbrev", "nlm")) == "nlm" else "full journal names"

        return f"""You are a senior copy editor doing a final consistency pass.
The manuscript was already corrected section-by-section.
Return ONLY the revised manuscript text.

Goals:
- Keep edits minimal; do not rewrite content.
- Harmonize terminology and style consistently across all sections.
- Preserve paragraph structure and heading order.
- Keep citations numeric in brackets, e.g. [9, 19].
- Ensure citations and references follow Vancouver first-appearance numbering.
- Use journal profile "{journal_profile.get('label', 'Vancouver')}".
- In references, use initials {initials_rule}, titles in {title_rule}, and journal names as {journal_rule}.
- Preserve URLs/DOIs/emails exactly.
- Preserve {domain_for_prompt} technical terms.

Manuscript:
{manuscript_text}

Final consistent manuscript:"""

    def _call_ai_editor_sectioned(self, original: str, rules_corrected: str, options: Dict, settings: Dict) -> Optional[str]:
        """Run section-wise AI correction with safety checks and optional global pass."""
        chunks = self._split_for_section_analysis(original, rules_corrected, options)
        if len(chunks) <= 1:
            self._last_processing_audit["mode"] = "full"
            prompt = self._build_edit_prompt(original, rules_corrected, options, stage="full")
            return self._invoke_ai_provider(prompt, settings)

        ai_options = options.get("ai", {}) if isinstance(options, dict) else {}
        if not isinstance(ai_options, dict):
            ai_options = {}

        def clamp_int(raw_value, default_value, min_value, max_value):
            try:
                parsed = int(raw_value)
            except Exception:
                parsed = int(default_value)
            return max(int(min_value), min(int(max_value), parsed))

        def avg(values: List[int]) -> Optional[float]:
            if not values:
                return None
            return round(sum(values) / len(values), 2)

        def normalize_reason(reason: str) -> str:
            value = (reason or "").strip().lower()
            value = re.sub(r'[^a-z0-9]+', '_', value).strip('_')
            return value or "unknown"

        section_tolerance = clamp_int(ai_options.get("section_accept_tolerance", 4), 4, 0, 12)
        consistency_tolerance = clamp_int(ai_options.get("consistency_tolerance", 3), 3, 0, 12)
        max_consistency_chars = clamp_int(
            ai_options.get("global_consistency_max_chars", 18000),
            18000,
            6000,
            120000,
        )

        outputs: List[str] = []
        accepted_chunks = 0
        total_chunks = len(chunks)
        decisions: List[Dict] = []
        fallback_reason_counts: Dict[str, int] = {}
        self._last_processing_audit["mode"] = "sectioned"

        print(
            "[AI] sectioned analysis start: "
            f"sections={total_chunks} section_tolerance={section_tolerance} "
            f"consistency_tolerance={consistency_tolerance}"
        )

        for idx, chunk in enumerate(chunks, start=1):
            prompt = self._build_edit_prompt(
                chunk["original"],
                chunk["baseline"],
                options,
                stage="section",
                section_index=idx,
                section_total=total_chunks
            )
            ai_chunk = self._invoke_ai_provider(prompt, settings)
            if ai_chunk:
                ai_chunk = self.editor.correct_all(ai_chunk, options)
            selected_chunk, used_ai, decision = self._choose_candidate(
                original=chunk["original"],
                baseline=chunk["baseline"],
                ai_candidate=ai_chunk or "",
                tolerance=section_tolerance,
                stage="section",
            )
            decision["section_index"] = idx
            decision["section_total"] = total_chunks
            decision["line_start"] = int(chunk.get("line_start", 0))
            decision["line_end"] = int(chunk.get("line_end", 0))
            decision["baseline_chars"] = len(chunk.get("baseline", ""))
            decision["ai_chars"] = len(ai_chunk or "")
            decision["selected_chars"] = len(selected_chunk or "")
            decisions.append(decision)

            if used_ai:
                accepted_chunks += 1
            else:
                if decision.get("ai_score") is None:
                    reason_key = "empty_ai_output"
                else:
                    ai_reasons = decision.get("ai_reasons", [])
                    reason_key = normalize_reason(ai_reasons[0] if ai_reasons else "higher_risk_than_baseline")
                fallback_reason_counts[reason_key] = int(fallback_reason_counts.get(reason_key, 0)) + 1

            outputs.append(selected_chunk)

            ai_score = decision.get("ai_score")
            ai_score_text = "None" if ai_score is None else str(ai_score)
            reason = decision.get("decision_reason", "")
            print(
                f"[AI][Section {idx}/{total_chunks}] decision={decision.get('decision')} "
                f"baseline={decision.get('baseline_score')} ai={ai_score_text} "
                f"risk={decision.get('ai_risk')} reason={reason}"
            )

        merged = '\n'.join(outputs)
        if not merged.strip():
            self._last_ai_pipeline_note = "Section-wise AI returned no usable text; using rule-based correction."
            self._last_chunk_decisions = decisions
            self._last_processing_audit["sections"] = decisions
            self._last_processing_audit["summary"] = {
                "total_sections": total_chunks,
                "accepted_sections": accepted_chunks,
                "fallback_sections": max(0, total_chunks - accepted_chunks),
                "acceptance_rate": round((accepted_chunks / total_chunks) * 100, 2) if total_chunks else 0.0,
                "section_tolerance": section_tolerance,
                "consistency_tolerance": consistency_tolerance,
                "fallback_reason_counts": dict(sorted(fallback_reason_counts.items(), key=lambda pair: (-pair[1], pair[0]))),
                "reason": "empty merged output",
            }
            return None

        consistency_audit: Dict = {
            "ran": False,
            "decision": "skipped",
            "reason": "Global consistency pass skipped (manuscript too long).",
            "threshold_chars": max_consistency_chars,
            "merged_chars": len(merged),
        }
        consistency_note = "Global consistency pass skipped (manuscript too long)."
        if len(merged) <= max_consistency_chars:
            consistency_prompt = self._build_consistency_prompt(merged, options)
            ai_consistent = self._invoke_ai_provider(consistency_prompt, settings)
            if ai_consistent:
                ai_consistent = self.editor.correct_all(ai_consistent, options)
            merged_selected, used_ai, consistency_decision = self._choose_candidate(
                original=original,
                baseline=merged,
                ai_candidate=ai_consistent or "",
                tolerance=consistency_tolerance,
                stage="global_consistency",
            )
            merged = merged_selected
            consistency_quality_before = consistency_decision.get("baseline_quality")
            consistency_quality_after = (
                consistency_decision.get("ai_quality")
                if consistency_decision.get("ai_score") is not None
                else None
            )
            quality_delta = None
            if isinstance(consistency_quality_before, int) and isinstance(consistency_quality_after, int):
                quality_delta = consistency_quality_after - consistency_quality_before
            consistency_audit = {
                "ran": True,
                "decision": consistency_decision.get("decision"),
                "reason": consistency_decision.get("decision_reason", ""),
                "tolerance": consistency_tolerance,
                "baseline_score": consistency_decision.get("baseline_score"),
                "ai_score": consistency_decision.get("ai_score"),
                "baseline_quality": consistency_quality_before,
                "ai_quality": consistency_quality_after,
                "quality_delta": quality_delta,
                "details": consistency_decision,
            }
            print(
                "[AI][Consistency] "
                f"decision={consistency_decision.get('decision')} "
                f"baseline={consistency_decision.get('baseline_score')} "
                f"ai={consistency_decision.get('ai_score')}"
            )
            consistency_note = (
                "Global consistency pass applied."
                if used_ai else
                "Global consistency pass returned unstable output; kept section-merged text."
            )

        fallback_chunks = max(0, total_chunks - accepted_chunks)
        baseline_scores: List[int] = [int(d.get("baseline_score", 0)) for d in decisions]
        ai_scores: List[int] = [int(d.get("ai_score")) for d in decisions if isinstance(d.get("ai_score"), int)]
        accepted_ai_scores: List[int] = [
            int(d.get("ai_score"))
            for d in decisions
            if d.get("decision") == "accepted" and isinstance(d.get("ai_score"), int)
        ]
        baseline_quality_scores: List[int] = [int(d.get("baseline_quality", 0)) for d in decisions]
        ai_quality_scores: List[int] = [int(d.get("ai_quality", 0)) for d in decisions if isinstance(d.get("ai_score"), int)]
        accepted_ai_quality_scores: List[int] = [
            int(d.get("ai_quality", 0))
            for d in decisions
            if d.get("decision") == "accepted" and isinstance(d.get("ai_score"), int)
        ]

        sorted_fallback_reason_counts = dict(
            sorted(fallback_reason_counts.items(), key=lambda pair: (-pair[1], pair[0]))
        )

        self._last_chunk_decisions = decisions
        self._last_processing_audit["sections"] = decisions
        self._last_processing_audit["summary"] = {
            "total_sections": total_chunks,
            "accepted_sections": accepted_chunks,
            "fallback_sections": fallback_chunks,
            "acceptance_rate": round((accepted_chunks / total_chunks) * 100, 2) if total_chunks else 0.0,
            "section_tolerance": section_tolerance,
            "consistency_tolerance": consistency_tolerance,
            "average_baseline_risk_score": avg(baseline_scores),
            "average_ai_risk_score": avg(ai_scores),
            "average_accepted_ai_risk_score": avg(accepted_ai_scores),
            "average_baseline_quality": avg(baseline_quality_scores),
            "average_ai_quality": avg(ai_quality_scores),
            "average_accepted_ai_quality": avg(accepted_ai_quality_scores),
            "fallback_reason_counts": sorted_fallback_reason_counts,
            "consistency": consistency_audit,
        }

        self._last_ai_pipeline_note = (
            f"Section-wise AI analysis used ({total_chunks} sections, accepted {accepted_chunks}, fallback {fallback_chunks}, "
            f"acceptance {round((accepted_chunks / total_chunks) * 100, 2) if total_chunks else 0.0}%). "
            f"{consistency_note}"
        )
        return merged

    def _get_ai_settings(self, options: Dict) -> Dict:
        """Get AI settings from request options."""
        ai_options = options.get("ai", {}) if isinstance(options, dict) else {}
        if not isinstance(ai_options, dict):
            ai_options = {}

        provider = str(ai_options.get("provider", "ollama")).strip().lower()
        if provider not in ("ollama", "gemini", "openrouter", "agent_router"):
            provider = "ollama"

        model = str(ai_options.get("model", "")).strip()
        gemini_api_key = str(
            ai_options.get("gemini_api_key", ai_options.get("api_key", os.getenv("GEMINI_API_KEY", "")))
        ).strip()
        openrouter_api_key = str(
            ai_options.get("openrouter_api_key", os.getenv("OPENROUTER_API_KEY", ""))
        ).strip()

        if provider == "gemini":
            default_model = self.gemini_model
        elif provider == "openrouter":
            default_model = self.openrouter_model
        elif provider == "agent_router":
            default_model = self.agent_router_model
        else:
            default_model = self.model

        return {
            "enabled": bool(ai_options.get("enabled", True)),
            "provider": provider,
            "ollama_host": str(ai_options.get("ollama_host", self.ollama_host)).strip() or self.ollama_host,
            "model": model or default_model,
            "gemini_api_key": gemini_api_key,
            "openrouter_api_key": openrouter_api_key,
        }

    def _call_ollama_editor(self, prompt: str, settings: Dict) -> Optional[str]:
        """Call Ollama AI for enhanced editing."""
        ollama_host = settings["ollama_host"]
        if not self._check_ollama(ollama_host):
            self._warn_once("Ollama is not reachable; falling back to rule-based editing.")
            return None

        resolved_model = self._resolve_ollama_model(ollama_host, settings["model"])
        if not resolved_model:
            self._warn_once("No Ollama model found; falling back to rule-based editing.")
            return None

        if resolved_model != settings["model"]:
            self._warn_once(
                f"Ollama model '{settings['model']}' not available. Using '{resolved_model}' instead."
            )

        try:
            response = requests.post(
                f"{ollama_host}/api/generate",
                json={
                    "model": resolved_model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3}
                },
                timeout=60
            )

            if response.status_code == 200:
                self._last_ai_warning = ""
                result = response.json().get("response", "")
                return self._extract_corrected_text(result)
            if response.status_code == 404 and "not found" in response.text.lower():
                fallback_model = self._resolve_ollama_model(ollama_host, "")
                if fallback_model and fallback_model != resolved_model:
                    retry = requests.post(
                        f"{ollama_host}/api/generate",
                        json={
                            "model": fallback_model,
                            "prompt": prompt,
                            "stream": False,
                            "options": {"temperature": 0.3}
                        },
                        timeout=60
                    )
                    if retry.status_code == 200:
                        self._warn_once(
                            f"Ollama model '{resolved_model}' not found. Retried with '{fallback_model}'."
                        )
                        self._last_ai_warning = ""
                        result = retry.json().get("response", "")
                        return self._extract_corrected_text(result)
                self._warn_once(
                    f"Ollama model '{resolved_model}' not found; falling back to rule-based editing."
                )
                return None

            self._warn_once(
                f"Ollama editing failed ({response.status_code}); falling back to rule-based editing."
            )
        except Exception as e:
            self._warn_once(f"Ollama editing failed: {e}")

        return None

    def _call_gemini_editor(self, prompt: str, settings: Dict) -> Optional[str]:
        """Call Gemini AI for enhanced editing."""
        if not settings["gemini_api_key"]:
            self._warn_once("Gemini API key not set; falling back to rule-based editing.")
            return None

        model = settings["model"]
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={settings['gemini_api_key']}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.3},
        }

        try:
            response = requests.post(url, json=payload, timeout=60)
            if response.status_code == 200:
                self._last_ai_warning = ""
                return self._extract_corrected_text(self._extract_gemini_text(response.json()))
            if response.status_code == 403:
                self._warn_once(
                    "Gemini request blocked (403). Check API key/project restrictions or use Ollama."
                )
            else:
                self._warn_once(
                    f"Gemini editing failed ({response.status_code}); falling back to rule-based editing."
                )
        except Exception as e:
            self._warn_once(f"Gemini editing failed: {e}")

        return None

    def _call_openrouter_editor(self, prompt: str, settings: Dict) -> Optional[str]:
        """Call OpenRouter-compatible chat completion API."""
        if not settings["openrouter_api_key"]:
            self._warn_once("OpenRouter API key not set; falling back to rule-based editing.")
            return None

        model = settings["model"] or self.openrouter_model
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings['openrouter_api_key']}",
            "Content-Type": "application/json",
        }

        # Optional but recommended by OpenRouter for analytics/rate limits.
        referer = os.getenv("OPENROUTER_HTTP_REFERER", "").strip()
        title = os.getenv("OPENROUTER_APP_TITLE", "Manuscript Editor").strip()
        if referer:
            headers["HTTP-Referer"] = referer
        if title:
            headers["X-Title"] = title

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a professional copy editor. Return only corrected manuscript text.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=75)
            if response.status_code == 200:
                self._last_ai_warning = ""
                return self._extract_corrected_text(self._extract_openrouter_text(response.json()))
            if response.status_code in (401, 403):
                self._warn_once("OpenRouter request unauthorized/forbidden; check API key and model access.")
            elif response.status_code == 429:
                self._warn_once("OpenRouter rate-limited (429); falling back to rule-based editing.")
            else:
                self._warn_once(
                    f"OpenRouter editing failed ({response.status_code}); falling back to rule-based editing."
                )
        except Exception as e:
            self._warn_once(f"OpenRouter editing failed: {e}")

        return None

    def _extract_invariant_tokens(self, text: str) -> Dict[str, Set[str]]:
        """Extract tokens that should remain intact across editing passes."""
        urls = set(re.findall(r'(?i)\b(?:https?|ftp)://[^\s<>"\']+', text))
        urls.update(re.findall(r'(?i)\bwww\.[^\s<>"\']+', text))
        dois = set(re.findall(r'(?i)\bdoi:\s*10\.\d{4,9}/[^\s<>"\']+', text))
        dois.update(re.findall(r'(?i)\b10\.\d{4,9}/[^\s<>"\']+', text))
        emails = set(re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', text))

        citation_numbers: Set[str] = set()
        for group in re.findall(r'\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]', text):
            for part in group.split(','):
                token = part.strip()
                if token:
                    citation_numbers.add(token)

        return {
            "urls": urls,
            "dois": dois,
            "emails": emails,
            "citations": citation_numbers,
        }

    def _candidate_risk_score(self, original: str, candidate: str) -> Tuple[int, List[str]]:
        """Score candidate stability risk; lower is better."""
        penalties = 0
        reasons: List[str] = []

        orig = (original or "").strip()
        cand = (candidate or "").strip()
        if not cand:
            return 999, ["empty output"]

        orig_len = max(1, len(orig))
        cand_len = len(cand)
        len_ratio = cand_len / orig_len
        if len_ratio < 0.60 or len_ratio > 1.60:
            penalties += 35
            reasons.append("large length drift")
        elif len_ratio < 0.75 or len_ratio > 1.35:
            penalties += 12
            reasons.append("moderate length drift")

        orig_paras = max(1, orig.count('\n') + 1)
        cand_paras = max(1, cand.count('\n') + 1)
        para_ratio = cand_paras / orig_paras
        if para_ratio < 0.55 or para_ratio > 1.80:
            penalties += 25
            reasons.append("paragraph structure drift")

        similarity = difflib.SequenceMatcher(a=orig, b=cand, autojunk=False).ratio()
        rewrite_ratio = 1.0 - similarity
        if rewrite_ratio > 0.70:
            penalties += 30
            reasons.append("heavy rewrite")
        elif rewrite_ratio > 0.55:
            penalties += 12
            reasons.append("moderate rewrite")

        orig_tokens = self._extract_invariant_tokens(orig)
        cand_tokens = self._extract_invariant_tokens(cand)

        if orig_tokens["urls"] - cand_tokens["urls"]:
            penalties += 40
            reasons.append("missing urls")
        if orig_tokens["dois"] - cand_tokens["dois"]:
            penalties += 40
            reasons.append("missing doi")
        if orig_tokens["emails"] - cand_tokens["emails"]:
            penalties += 30
            reasons.append("missing emails")

        orig_cites = orig_tokens["citations"]
        cand_cites = cand_tokens["citations"]
        if orig_cites and len(cand_cites) < max(1, int(len(orig_cites) * 0.70)):
            penalties += 20
            reasons.append("citation loss")

        if re.search(r'^\s*references?\s*:?\s*$', orig, flags=re.IGNORECASE | re.MULTILINE):
            if not re.search(r'^\s*references?\s*:?\s*$', cand, flags=re.IGNORECASE | re.MULTILINE):
                penalties += 20
                reasons.append("missing references heading")

        return penalties, reasons

    def _select_best_correction(self, original: str, rules_corrected: str, ai_corrected: str) -> str:
        """Select the safest correction output between rule-only and AI-enhanced variants."""
        if not ai_corrected.strip():
            self._last_selection_note = "AI output empty; using rule-based correction."
            summary = self._last_processing_audit.setdefault("summary", {})
            summary["final_selection"] = {
                "decision": "rule_fallback",
                "reason": "empty ai output",
            }
            return rules_corrected

        rule_score, rule_reasons = self._candidate_risk_score(original, rules_corrected)
        ai_score, ai_reasons = self._candidate_risk_score(original, ai_corrected)
        summary = self._last_processing_audit.setdefault("summary", {})

        # AI candidate must be at least as stable as rule-based output (small tolerance).
        if ai_score <= rule_score + 3:
            self._last_selection_note = f"AI accepted (rule_score={rule_score}, ai_score={ai_score})."
            summary["final_selection"] = {
                "decision": "ai_accepted",
                "rule_score": rule_score,
                "ai_score": ai_score,
                "rule_reasons": rule_reasons,
                "ai_reasons": ai_reasons,
                "tolerance": 3,
            }
            return ai_corrected

        self._warn_once(
            "AI output looked unstable; using safer correction set. "
            f"(rule_score={rule_score}, ai_score={ai_score})"
        )
        self._last_selection_note = (
            f"Rule fallback: rule={rule_score} ({', '.join(rule_reasons) or 'ok'}), "
            f"ai={ai_score} ({', '.join(ai_reasons) or 'ok'})"
        )
        summary["final_selection"] = {
            "decision": "rule_fallback",
            "rule_score": rule_score,
            "ai_score": ai_score,
            "rule_reasons": rule_reasons,
            "ai_reasons": ai_reasons,
            "tolerance": 3,
        }
        return rules_corrected

    def _warn_once(self, message: str):
        """Print non-fatal AI warning once until state changes."""
        if message != self._last_ai_warning:
            print(message)
            self._last_ai_warning = message

    def _extract_gemini_text(self, response_json: Dict) -> str:
        """Extract response text from Gemini payload."""
        candidates = response_json.get("candidates", [])
        for candidate in candidates:
            content = candidate.get("content", {})
            parts = content.get("parts", [])
            texts = [part.get("text", "") for part in parts if isinstance(part, dict)]
            joined = "".join(texts).strip()
            if joined:
                return joined
        return ""

    def _extract_openrouter_text(self, response_json: Dict) -> str:
        """Extract assistant text from OpenRouter chat completion payload."""
        choices = response_json.get("choices", [])
        for choice in choices:
            message = choice.get("message", {}) if isinstance(choice, dict) else {}
            content = message.get("content", "")
            if isinstance(content, str):
                text = content.strip()
                if text:
                    return text
            elif isinstance(content, list):
                parts: List[str] = []
                for item in content:
                    if isinstance(item, dict):
                        piece = item.get("text", "")
                        if isinstance(piece, str) and piece:
                            parts.append(piece)
                joined = "".join(parts).strip()
                if joined:
                    return joined
        return ""

    def _check_ollama(self, ollama_host: str) -> bool:
        """Check if Ollama is running."""
        try:
            response = requests.get(f"{ollama_host}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False

    def _get_ollama_models(self, ollama_host: str) -> List[str]:
        """Return available Ollama model names."""
        names: List[str] = []
        try:
            response = requests.get(f"{ollama_host}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                models = data.get("models", []) if isinstance(data, dict) else []
                for model in models:
                    if isinstance(model, dict):
                        name = str(model.get("name", "")).strip()
                        if name and name not in names:
                            names.append(name)
        except Exception:
            pass

        if names:
            return names

        # Fallback for environments where API endpoint isn't reachable but CLI works.
        try:
            proc = subprocess.run(
                ["ollama", "list"],
                check=False,
                capture_output=True,
                text=True,
                timeout=5
            )
            if proc.returncode == 0 and proc.stdout:
                for line in proc.stdout.splitlines()[1:]:
                    line = line.strip()
                    if not line:
                        continue
                    name = line.split()[0].strip()
                    if name and name not in names:
                        names.append(name)
        except Exception:
            pass

        return names

    def _resolve_ollama_model(self, ollama_host: str, requested_model: str) -> Optional[str]:
        """Resolve a usable Ollama model, preferring requested model when available."""
        available = self._get_ollama_models(ollama_host)
        if not available:
            return None

        requested = (requested_model or "").strip()
        if requested:
            if requested in available:
                return requested
            if ":" not in requested:
                for model in available:
                    if model.split(":", 1)[0] == requested:
                        return model

        preferred_bases = ("llama3.1", "llama3", "gemma4", "mistral", "qwen2.5", "llama3.2")
        for base in preferred_bases:
            for model in available:
                if model.split(":", 1)[0] == base:
                    return model

        return available[0]

    def _build_edit_prompt(
        self,
        text: str,
        rules_corrected: str,
        options: Dict,
        stage: str = "full",
        section_index: int = 0,
        section_total: int = 0
    ) -> str:
        """Build the AI editing prompt."""
        instructions = []
        requested_domain = str(options.get('domain_profile', 'auto')).strip().lower()
        detected_domain = self.get_domain_report().get("profile", "general")
        domain_for_prompt = detected_domain if requested_domain == "auto" else requested_domain
        if domain_for_prompt not in ("general", "medical", "engineering", "law"):
            domain_for_prompt = "general"
        journal_profile = self.editor.resolve_journal_profile(options)
        initials_rule = (
            "use author initials without periods (e.g., Smith AB)"
            if not bool(journal_profile.get("initials_with_periods"))
            else "use author initials with periods (e.g., Smith A.B.)"
        )
        title_rule = (
            "use sentence case for article/chapter titles"
            if str(journal_profile.get("title_case", "sentence")) == "sentence"
            else "use title case for article/chapter titles"
        )
        journal_rule = (
            "abbreviate journal titles in NLM style"
            if str(journal_profile.get("journal_abbrev", "nlm")) == "nlm"
            else "keep full journal titles (no abbreviation)"
        )

        if options.get('spelling', True):
            instructions.append("- Fix any spelling errors using American spelling (Chicago preference)")
            instructions.append(f"- Preserve {domain_for_prompt} terminology; do not replace technical terms with generic synonyms")
        if options.get('sentence_case', True):
            instructions.append("- Fix capitalization: capitalize first word of sentences, days, months, proper nouns")
        if options.get('punctuation', True):
            instructions.append("- Fix punctuation: proper spacing, quotation marks, ellipsis (...)")
        if options.get('chicago_style', True):
            instructions.append(f"""
- Chicago Manual of Style rules:
  * Use American spelling (ize not ise)
  * Use serial comma
  * Keep author affiliation markers as superscripts (for example: ¹ Dr. Name)
  * Keep in-text citations in numeric bracket format like [9, 19] (no author-year citation text in body)
  * Format the References section in Vancouver numbered style (e.g., [1], [2], [3])
  * Ensure citation numbers and reference numbers follow Vancouver first-appearance order
  * Follow journal profile: {journal_profile.get('label', 'Vancouver')}
  * In references, {initials_rule}
  * In references, {title_rule}
  * In references, {journal_rule}
  * Do NOT alter URLs, DOIs, or email addresses (keep exact spelling, case, and spacing)
  * Italicize titles of complete works
  * Use double quotation marks for quoted material
  * Use em-dash (—) without spaces for interruptions
  * Keep keyword line in this style: Keyword: Key one, Key two, Key three
""")

        stage_instruction = ""
        if stage == "section" and section_total > 1:
            stage_instruction = (
                f"\nThis is section {section_index} of {section_total} from a larger manuscript.\n"
                "Edit only this section and preserve line/paragraph boundaries.\n"
            )

        prompt = f"""You are a professional copy editor following The Chicago Manual of Style.
Edit the manuscript and return ONLY the corrected text.
Do NOT add explanations or comments - just the corrected text.
Apply minimal edits only; do not rewrite unchanged sentences.
Preserve structure, references order, citation positions, URLs, DOIs, and emails.
{stage_instruction}

Corrections to apply:
{chr(10).join(instructions)}

Original manuscript:
{text}

Baseline corrected draft (already rule-checked):
{rules_corrected}

Corrected manuscript:"""

        return prompt

    def _extract_corrected_text(self, ai_response: str) -> str:
        """Extract just the corrected text from AI response."""
        # Remove any leading/trailing whitespace
        text = ai_response.strip()

        # Remove common wrapper phrases
        phrases_to_remove = [
            "corrected manuscript:",
            "here's the corrected",
            "corrected text:",
            "edited manuscript:",
        ]

        for phrase in phrases_to_remove:
            if text.lower().startswith(phrase):
                text = text[len(phrase):].strip()

        return text

    def generate_clean_docx(self, text: str, output_path: str):
        """Generate a clean DOCX with all corrections applied."""
        doc = Document()

        # Set document margins
        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(1)
            section.bottom_margin = Inches(1)
            section.left_margin = Inches(1.25)
            section.right_margin = Inches(1.25)

        # Set default font
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Times New Roman'
        font.size = Pt(12)

        # Add paragraphs
        for paragraph in text.split('\n'):
            if paragraph.strip():
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(0)
                p.paragraph_format.line_spacing = 1.5
                for is_missing, segment in self._iter_missing_placeholder_segments(paragraph):
                    if is_missing:
                        self._append_docx_run(p, segment, is_missing=True)
                        continue
                    for is_foreign, foreign_segment in self._iter_foreign_segments(segment):
                        self._append_docx_run(p, foreign_segment, is_foreign=is_foreign)

        doc.save(output_path)

    def generate_highlighted_docx(self, original: str, corrected: str, output_path: str):
        """Generate a DOCX with track changes showing corrections."""
        doc = Document()

        # Set document margins
        sections = doc.sections
        for section in sections:
            section.top_margin = Inches(1)
            section.bottom_margin = Inches(1)
            section.left_margin = Inches(1.25)
            section.right_margin = Inches(1.25)

        # Set default font
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Times New Roman'
        font.size = Pt(12)

        def add_paragraph():
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.5
            return paragraph

        paragraph = add_paragraph()

        for segment_type, segment_text in self._iter_diff_segments(original, corrected):
            lines = segment_text.split('\n')
            for line_idx, line_text in enumerate(lines):
                if line_idx > 0:
                    paragraph = add_paragraph()
                if not line_text:
                    continue
                for is_missing, outer_segment in self._iter_missing_placeholder_segments(line_text):
                    if is_missing:
                        self._append_docx_run(paragraph, outer_segment, segment_type=segment_type, is_missing=True)
                        continue
                    for is_foreign, sub_segment in self._iter_foreign_segments(outer_segment):
                        self._append_docx_run(paragraph, sub_segment, segment_type=segment_type, is_foreign=is_foreign)

        doc.save(output_path)

    def build_redline_html(self, original: str, corrected: str) -> str:
        """Build redline HTML preview with Word-style red change markup."""
        chunks = []
        for segment_type, segment_text in self._iter_diff_segments(original, corrected):
            escaped = self._build_annotated_html(segment_text, include_foreign=False)
            if segment_type == "delete":
                chunks.append(f'<span class="redline-del">{escaped}</span>')
            elif segment_type == "insert":
                chunks.append(f'<span class="redline-add">{escaped}</span>')
            else:
                chunks.append(escaped)
        return "".join(chunks)

    def _foreign_terms_catalog(self) -> List[str]:
        """Return sorted foreign-term catalog."""
        terms = getattr(self.editor, "FOREIGN_TERMS", set()) or set()
        return sorted({str(t).strip().lower() for t in terms if str(t).strip()}, key=len, reverse=True)

    def _protected_literal_spans(self, text: str) -> List[Tuple[int, int]]:
        """Return merged spans for literals that must never be foreign-term styled."""
        source = text or ""
        if not source:
            return []

        patterns = [
            re.compile(r'(?i)\b(?:https?|ftp)://[^\s<>"\']+'),
            re.compile(r'(?i)\bwww\.[^\s<>"\']+'),
            re.compile(r'(?i)\bdoi:\s*10\.\d{4,9}/[^\s<>"\']+'),
            re.compile(r'(?i)\b10\.\d{4,9}/[^\s<>"\']+'),
            re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'),
        ]

        spans: List[Tuple[int, int]] = []
        for pattern in patterns:
            for match in pattern.finditer(source):
                spans.append((match.start(), match.end()))

        if not spans:
            return []

        spans.sort(key=lambda item: (item[0], item[1]))
        merged: List[List[int]] = []
        for start, end in spans:
            if not merged or start > merged[-1][1]:
                merged.append([start, end])
                continue
            merged[-1][1] = max(int(merged[-1][1]), int(end))
        return [(int(start), int(end)) for start, end in merged]

    def _span_overlaps(self, spans: List[Tuple[int, int]], start: int, end: int) -> bool:
        """Return True when [start, end) overlaps any span in a sorted span list."""
        for span_start, span_end in spans:
            if end <= span_start:
                break
            if start < span_end and end > span_start:
                return True
        return False

    def _iter_foreign_segments(self, text: str):
        """Yield tuple (is_foreign, segment_text) by matching known foreign terms."""
        source = text or ""
        terms = self._foreign_terms_catalog()
        if not source or not terms:
            if source:
                yield False, source
            return

        pattern = re.compile(
            r'(?i)(?<!\w)(' + '|'.join(re.escape(term) for term in terms) + r')(?!\w)'
        )
        protected_spans = self._protected_literal_spans(source)

        last = 0
        for match in pattern.finditer(source):
            start, end = match.span()
            if self._span_overlaps(protected_spans, start, end):
                continue
            if match.start() > last:
                yield False, source[last:match.start()]
            yield True, match.group(0)
            last = match.end()

        if last < len(source):
            yield False, source[last:]

    def _iter_missing_placeholder_segments(self, text: str):
        """Yield tuple (is_missing_placeholder, segment_text)."""
        source = text or ""
        pattern = getattr(self.editor, "MISSING_PLACEHOLDER_RE", None)
        if not source or pattern is None:
            if source:
                yield False, source
            return

        last = 0
        for match in pattern.finditer(source):
            if match.start() > last:
                yield False, source[last:match.start()]
            yield True, match.group(0)
            last = match.end()

        if last < len(source):
            yield False, source[last:]

    def _append_docx_run(self, paragraph, text: str, *, segment_type: Optional[str] = None, is_foreign: bool = False, is_missing: bool = False):
        """Append a styled DOCX run for preview/export output."""
        run = paragraph.add_run(text)
        if is_foreign:
            run.italic = True
        if segment_type == "delete":
            run.font.strike = True
        elif segment_type == "insert":
            run.font.underline = True

        if is_missing:
            run.font.color.rgb = self.MISSING_PLACEHOLDER_COLOR
        elif segment_type in ("delete", "insert"):
            run.font.color.rgb = RGBColor(200, 0, 0)
        return run

    def _build_annotated_html(self, text: str, include_foreign: bool = True) -> str:
        """Return HTML-safe text with placeholders/foreign terms wrapped for display."""
        parts: List[str] = []
        for is_missing, segment in self._iter_missing_placeholder_segments(text):
            if is_missing:
                parts.append(f'<span class="missing-placeholder">{html.escape(segment)}</span>')
                continue
            if include_foreign:
                for is_foreign, sub_segment in self._iter_foreign_segments(segment):
                    escaped = html.escape(sub_segment)
                    if is_foreign:
                        parts.append(f'<em class="foreign-term">{escaped}</em>')
                    else:
                        parts.append(escaped)
            else:
                parts.append(html.escape(segment))
        return "".join(parts)

    def build_foreign_annotated_html(self, text: str) -> str:
        """Return HTML-safe text with foreign terms wrapped for italic rendering."""
        lines = (text or "").split('\n')
        out_lines: List[str] = []

        for line in lines:
            out_lines.append(self._build_annotated_html(line, include_foreign=True))

        return '\n'.join(out_lines)

    def get_domain_report(self) -> Dict:
        """Return domain dictionary usage report from editor."""
        if hasattr(self.editor, "get_domain_report"):
            return self.editor.get_domain_report()
        return {
            "profile": "general",
            "scores": {"medical": 0, "engineering": 0, "law": 0},
            "protected_terms": 0,
        }

    def get_processing_audit(self) -> Dict:
        """Return last processing audit details (chunk decisions, scores, summary)."""
        if not self._last_processing_audit:
            return {"mode": "unknown", "sections": [], "summary": {}}
        return self._last_processing_audit

    def get_journal_profile_report(self) -> Dict:
        """Return profile-aware reference formatting audit for last run."""
        if self._last_journal_profile_report:
            return self._last_journal_profile_report
        return self.editor.build_reference_profile_report("", {"journal_profile": "vancouver_periods"})

    def get_citation_reference_report(self) -> Dict:
        """Return citation/reference validator report for last run."""
        if self._last_citation_reference_report:
            return self._last_citation_reference_report
        return self.editor.build_citation_reference_validator_report("", {"journal_profile": "vancouver_periods"})

    def build_noun_report(self, text: str) -> Dict:
        """Identify proper/common nouns, preferring spaCy and falling back to heuristics."""
        content = text or ""
        if not content.strip():
            return {"source": "none", "proper_nouns": [], "common_nouns": []}

        spacy_report = self._build_noun_report_spacy(content)
        if spacy_report is not None:
            return spacy_report

        return self._build_noun_report_heuristic(content)

    def _build_noun_report_spacy(self, text: str) -> Optional[Dict]:
        """Use spaCy POS tags when available."""
        try:
            if self._nlp is None:
                import spacy  # type: ignore
                self._nlp = spacy.load("en_core_web_sm")
            doc = self._nlp(text)
        except Exception:
            return None

        proper_counter: Counter = Counter()
        common_counter: Counter = Counter()

        for token in doc:
            if not token.is_alpha:
                continue
            value = token.text.strip()
            if len(value) < 2:
                continue
            if token.pos_ == "PROPN":
                proper_counter[value] += 1
            elif token.pos_ == "NOUN":
                common_counter[value.lower()] += 1

        return {
            "source": "spacy",
            "proper_nouns": [{"word": k, "count": v} for k, v in proper_counter.most_common(60)],
            "common_nouns": [{"word": k, "count": v} for k, v in common_counter.most_common(80)],
        }

    def _build_noun_report_heuristic(self, text: str) -> Dict:
        """Heuristic noun extraction fallback when spaCy is unavailable."""
        stopwords = {
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'had',
            'has', 'have', 'he', 'her', 'his', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'she',
            'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'to', 'was', 'were',
            'will', 'with', 'we', 'you', 'your', 'our', 'not', 'no', 'yes'
        }

        proper_counter: Counter = Counter()
        common_counter: Counter = Counter()

        sentence_split = re.split(r'(?<=[.!?])\s+', text)
        for sentence in sentence_split:
            words = re.findall(r"[A-Za-z][A-Za-z'’\-]*", sentence)
            for idx, word in enumerate(words):
                lower = word.lower()
                if len(lower) < 2 or lower in stopwords:
                    continue

                looks_proper = False
                if re.fullmatch(r"[A-Z]{2,}", word):
                    looks_proper = True
                elif word[0].isupper() and idx > 0:
                    looks_proper = True

                if looks_proper:
                    proper_counter[word] += 1
                else:
                    common_counter[lower] += 1

        return {
            "source": "heuristic",
            "proper_nouns": [{"word": k, "count": v} for k, v in proper_counter.most_common(60)],
            "common_nouns": [{"word": k, "count": v} for k, v in common_counter.most_common(80)],
        }

    def build_corrections_report(self, original: str, corrected: str) -> Dict:
        """Build grouped correction list for quick review in UI."""
        group_order = ("spelling", "capitalization", "punctuation", "citation", "reference", "style")
        groups: Dict[str, List[Dict]] = {key: [] for key in group_order}
        seen = set()
        max_total_items = 1200

        original_lines = original.split('\n')
        corrected_lines = corrected.split('\n')
        original_ref_flags = self._reference_line_flags(original_lines)
        corrected_ref_flags = self._reference_line_flags(corrected_lines)

        line_matcher = difflib.SequenceMatcher(a=original_lines, b=corrected_lines, autojunk=False)

        def push_item(kind: str, line_number: int, old_text: str, new_text: str, context_line: str):
            if kind not in groups:
                kind = "style"
            if sum(len(v) for v in groups.values()) >= max_total_items:
                return

            old_text = (old_text or "").strip()
            new_text = (new_text or "").strip()
            context_line = (context_line or "").strip()
            if not old_text and not new_text:
                return

            if len(context_line) > 220:
                context_line = context_line[:217] + "..."

            key = (kind, line_number, old_text, new_text)
            if key in seen:
                return
            seen.add(key)

            groups[kind].append({
                "line": max(1, int(line_number)),
                "original": old_text,
                "corrected": new_text,
                "context": context_line,
            })

        for opcode, i1, i2, j1, j2 in line_matcher.get_opcodes():
            if opcode == "equal":
                continue

            left_lines = original_lines[i1:i2]
            right_lines = corrected_lines[j1:j2]
            pair_count = max(len(left_lines), len(right_lines))

            for idx in range(pair_count):
                old_line = left_lines[idx] if idx < len(left_lines) else ""
                new_line = right_lines[idx] if idx < len(right_lines) else ""
                corr_line_no = (j1 + idx + 1) if (j1 + idx) < len(corrected_lines) else (i1 + idx + 1)
                is_reference_line = False
                if (j1 + idx) < len(corrected_ref_flags):
                    is_reference_line = corrected_ref_flags[j1 + idx]
                elif (i1 + idx) < len(original_ref_flags):
                    is_reference_line = original_ref_flags[i1 + idx]

                for change in self._line_level_changes(old_line, new_line, is_reference_line):
                    push_item(
                        kind=change["type"],
                        line_number=corr_line_no,
                        old_text=change["original"],
                        new_text=change["corrected"],
                        context_line=new_line or old_line,
                    )

        counts = {kind: len(items) for kind, items in groups.items()}
        total = sum(counts.values())
        return {
            "total": total,
            "counts": counts,
            "groups": groups,
        }

    def _normalize_group_decisions(self, group_decisions: Optional[Dict]) -> Dict[str, bool]:
        """Normalize correction-group accept/reject map to stable booleans."""
        groups = ("spelling", "capitalization", "punctuation", "citation", "reference", "style")
        normalized: Dict[str, bool] = {key: True for key in groups}
        if not isinstance(group_decisions, dict):
            return normalized

        for key in groups:
            if key not in group_decisions:
                continue
            value = group_decisions.get(key)
            if isinstance(value, bool):
                normalized[key] = value
                continue
            if isinstance(value, (int, float)):
                normalized[key] = bool(value)
                continue
            text = str(value).strip().lower()
            if text in ("1", "true", "yes", "accept", "accepted", "on"):
                normalized[key] = True
            elif text in ("0", "false", "no", "reject", "rejected", "off"):
                normalized[key] = False

        return normalized

    def apply_group_decisions(self, original: str, corrected: str, group_decisions: Optional[Dict]) -> str:
        """Apply correction-group accept/reject decisions and build deterministic accepted text."""
        if not (corrected or "").strip():
            return corrected or ""
        if not (original or "").strip():
            return corrected or ""

        decisions = self._normalize_group_decisions(group_decisions)
        original_lines = (original or "").split('\n')
        corrected_lines = (corrected or "").split('\n')
        original_ref_flags = self._reference_line_flags(original_lines)
        corrected_ref_flags = self._reference_line_flags(corrected_lines)
        matcher = difflib.SequenceMatcher(a=original_lines, b=corrected_lines, autojunk=False)
        merged_lines: List[str] = []

        for opcode, i1, i2, j1, j2 in matcher.get_opcodes():
            if opcode == "equal":
                merged_lines.extend(original_lines[i1:i2])
                continue

            left_lines = original_lines[i1:i2]
            right_lines = corrected_lines[j1:j2]
            pair_count = max(len(left_lines), len(right_lines))

            for idx in range(pair_count):
                old_line = left_lines[idx] if idx < len(left_lines) else ""
                new_line = right_lines[idx] if idx < len(right_lines) else ""

                is_reference_line = False
                if (j1 + idx) < len(corrected_ref_flags):
                    is_reference_line = corrected_ref_flags[j1 + idx]
                elif (i1 + idx) < len(original_ref_flags):
                    is_reference_line = original_ref_flags[i1 + idx]

                line_changes = self._line_level_changes(old_line, new_line, is_reference_line)
                change_type = str(line_changes[0].get("type", "style")) if line_changes else "style"
                accept_change = bool(decisions.get(change_type, True))
                chosen_line = new_line if accept_change else old_line

                if chosen_line != "":
                    merged_lines.append(chosen_line)

        return '\n'.join(merged_lines)

    def _reference_line_flags(self, lines: List[str]) -> List[bool]:
        """Mark which lines are inside references section."""
        flags: List[bool] = []
        in_references = False
        heading_re = re.compile(r'^\s*references?\s*:?\s*$', flags=re.IGNORECASE)
        section_break_re = re.compile(
            r'^\s*(?:appendix|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|author\s+contributions?)\s*:?\s*$',
            flags=re.IGNORECASE
        )

        for line in lines:
            stripped = line.strip()
            if heading_re.match(stripped):
                in_references = True
                flags.append(True)
                continue
            if in_references and section_break_re.match(stripped):
                in_references = False
                flags.append(False)
                continue
            flags.append(in_references)
        return flags

    def _line_level_changes(self, old_line: str, new_line: str, is_reference_line: bool) -> List[Dict]:
        """Return readable line-level changes for one line pair."""
        if old_line == new_line:
            return []

        old_text = old_line.strip()
        new_text = new_line.strip()
        return [{
            "type": self._classify_change(old_text, new_text, is_reference_line),
            "original": old_text,
            "corrected": new_text,
        }]

    def _classify_change(self, old_text: str, new_text: str, is_reference_line: bool) -> str:
        """Classify a single change into UI-friendly groups."""
        old_clean = (old_text or "").strip()
        new_clean = (new_text or "").strip()
        merged = f"{old_clean} {new_clean}".strip()

        if is_reference_line:
            return "reference"

        if re.search(r'(?i)\b(?:https?|ftp)://|www\.|doi:|10\.\d{4,9}/|\[\s*\d+(?:\s*,\s*\d+)*\s*\]', merged):
            return "citation"

        if old_clean and new_clean and old_clean.lower() == new_clean.lower() and old_clean != new_clean:
            return "capitalization"

        old_alpha = re.sub(r'[^A-Za-z]+', '', old_clean).lower()
        new_alpha = re.sub(r'[^A-Za-z]+', '', new_clean).lower()
        if old_alpha and new_alpha and old_alpha == new_alpha and old_clean != new_clean:
            return "punctuation"

        nonword_only = re.sub(r'[\w\s]', '', f"{old_clean}{new_clean}", flags=re.UNICODE)
        has_word_chars = bool(re.search(r'[\w]', f"{old_clean}{new_clean}", flags=re.UNICODE))
        if nonword_only and not has_word_chars:
            return "punctuation"

        if re.fullmatch(r"[A-Za-z][A-Za-z'’\-]*", old_clean) and re.fullmatch(r"[A-Za-z][A-Za-z'’\-]*", new_clean):
            return "spelling"

        return "style"

    def _tokenize_for_diff(self, text: str) -> List[str]:
        """Split text into fine-grained tokens (whitespace, words, punctuation)."""
        # Keeps whitespace as tokens so output spacing/newlines are preserved,
        # while separating punctuation to avoid whole-line highlights.
        return re.findall(r'\s+|[\w⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+|[^\w\s]', text, flags=re.UNICODE)

    def _iter_refined_replace_segments(self, deleted_text: str, inserted_text: str):
        """Refine replace chunks to avoid over-highlighting large spans."""
        deleted_tokens = self._tokenize_for_diff(deleted_text)
        inserted_tokens = self._tokenize_for_diff(inserted_text)
        matcher = difflib.SequenceMatcher(a=deleted_tokens, b=inserted_tokens, autojunk=False)

        for opcode, i1, i2, j1, j2 in matcher.get_opcodes():
            if opcode == "equal":
                equal_text = "".join(deleted_tokens[i1:i2])
                if equal_text:
                    yield "equal", equal_text
            elif opcode == "delete":
                del_text = "".join(deleted_tokens[i1:i2])
                if del_text:
                    yield "delete", del_text
            elif opcode == "insert":
                ins_text = "".join(inserted_tokens[j1:j2])
                if ins_text:
                    yield "insert", ins_text
            elif opcode == "replace":
                del_text = "".join(deleted_tokens[i1:i2])
                ins_text = "".join(inserted_tokens[j1:j2])
                if del_text:
                    yield "delete", del_text
                if ins_text:
                    yield "insert", ins_text

    def _iter_diff_segments(self, original: str, corrected: str):
        """Yield (segment_type, segment_text) where type is equal/delete/insert."""
        original_tokens = self._tokenize_for_diff(original)
        corrected_tokens = self._tokenize_for_diff(corrected)
        matcher = difflib.SequenceMatcher(a=original_tokens, b=corrected_tokens, autojunk=False)

        for opcode, i1, i2, j1, j2 in matcher.get_opcodes():
            if opcode == "equal":
                yield "equal", "".join(original_tokens[i1:i2])
            elif opcode == "delete":
                yield "delete", "".join(original_tokens[i1:i2])
            elif opcode == "insert":
                yield "insert", "".join(corrected_tokens[j1:j2])
            elif opcode == "replace":
                deleted = "".join(original_tokens[i1:i2])
                inserted = "".join(corrected_tokens[j1:j2])
                if deleted and inserted:
                    # Refine large replace spans so only changed words are highlighted.
                    yield from self._iter_refined_replace_segments(deleted, inserted)
                else:
                    if deleted:
                        yield "delete", deleted
                    if inserted:
                        yield "insert", inserted

    def _compute_diff(self, original: str, corrected: str) -> List[Dict]:
        """Compute differences between original and corrected."""
        corrections = []
        orig_words = original.split()
        corr_words = corrected.split()

        for i, (orig, corr) in enumerate(zip(orig_words, corr_words)):
            if orig != corr:
                corrections.append({
                    'position': i,
                    'original': orig,
                    'corrected': corr,
                    'type': 'replacement'
                })

        return corrections

    def _create_run_with_format(self, doc, para, text, format_dict):
        """Create a run with specific formatting."""
        run = para.add_run(text + ' ')
        if format_dict.get('strikethrough'):
            run.font.strike = True
        if format_dict.get('underline'):
            run.font.underline = True
        if format_dict.get('color'):
            run.font.color.rgb = format_dict['color']
        if format_dict.get('highlight'):
            run.font.highlight_color = format_dict['highlight']
        return run

    def _add_formatted_run(self, doc, run, text, **kwargs):
        """Add a formatted run to a paragraph."""
        run = doc.add_paragraph().add_run(text)
        if kwargs.get('strikethrough'):
            run.font.strike = True
        if kwargs.get('underline'):
            run.font.underline = True
        if kwargs.get('color'):
            run.font.color.rgb = kwargs['color']
        return run

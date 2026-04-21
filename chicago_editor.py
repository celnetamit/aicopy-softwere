"""Chicago Manual of Style editing rules and corrections."""

import re
from urllib.parse import quote
from typing import List, Tuple, Dict, Optional, Any

import requests


class ChicagoEditor:
    """Handles all Chicago Manual of Style corrections."""

    MISSING_PLACEHOLDER_RE = re.compile(r'\[[A-Za-z][A-Za-z ]* missing\]', flags=re.IGNORECASE)
    ONLINE_VALIDATION_MAX_REFERENCES = 25
    ONLINE_VALIDATION_TIMEOUT_SECONDS = 5

    # American vs British spelling preferences (Chicago prefers American)
    PREFERRED_SPELLINGS = {
        'analyze': 'analyze', 'analyse': 'analyze',
        'center': 'center', 'centre': 'center',
        'color': 'color', 'colour': 'color',
        'defense': 'defense', 'defence': 'defense',
        'develop': 'develop', 'develope': 'develop',
        'favorite': 'favorite', 'favourite': 'favorite',
        'honor': 'honor', 'honour': 'honor',
        'humor': 'humor', 'humour': 'humor',
        'labor': 'labor', 'labour': 'labor',
        'neighbor': 'neighbor', 'neighbour': 'neighbor',
        'organize': 'organize', 'organise': 'organize',
        'realize': 'realize', 'realise': 'realize',
        'recognize': 'recognize', 'recognise': 'recognize',
        'travel': 'travel', 'travell': 'travel',
        'Canceled': 'Canceled', 'Cancelled': 'Canceled',
        ' installment': 'installment', 'instalment': 'installment',
        'fulfillment': 'fulfillment', 'fulfilment': 'fulfillment',
    }

    # Words that should always be capitalized
    PROPER_NOUNS = {
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
        'spring', 'summer', 'fall', 'winter',
    }
    WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june',
                   'july', 'august', 'september', 'october', 'november', 'december']
    AMBIGUOUS_MONTH_NAMES = {'march', 'may'}
    SUPERSCRIPT_MAP = str.maketrans({
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '+': '⁺', '-': '⁻'
    })
    NUMBER_WORDS = {
        'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
        'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
        'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40,
        'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
    }
    MEASUREMENT_UNITS = {
        'mg', 'g', 'kg', 'ng', 'ug', 'mcg',
        'ml', 'mL', 'l', 'L',
        'mm', 'cm', 'm', 'km',
        'in', 'ft', 'yd', 'mi',
        'hz', 'khz', 'mhz', 'ghz',
        'v', 'kv', 'mv',
        'w', 'kw', 'mw',
        'a', 'ma',
        '°c', '°f', 'k',
    }
    JOURNAL_ABBREVIATIONS = {
        'academy': 'Acad',
        'american': 'Am',
        'analysis': 'Anal',
        'annual': 'Annu',
        'architectural': 'Archit',
        'architecture': 'Archit',
        'association': 'Assoc',
        'australian': 'Aust',
        'british': 'Br',
        'bulletin': 'Bull',
        'canadian': 'Can',
        'clinical': 'Clin',
        'communication': 'Commun',
        'comparative': 'Comp',
        'computing': 'Comput',
        'conference': 'Conf',
        'contemporary': 'Contemp',
        'design': 'Des',
        'development': 'Dev',
        'education': 'Educ',
        'engineering': 'Eng',
        'environment': 'Environ',
        'environmental': 'Environ',
        'european': 'Eur',
        'experimental': 'Exp',
        'global': 'Glob',
        'health': 'Health',
        'history': 'Hist',
        'indian': 'Indian',
        'information': 'Inf',
        'institute': 'Inst',
        'integrative': 'Integr',
        'international': 'Int',
        'journal': 'J',
        'management': 'Manag',
        'materials': 'Mater',
        'medicine': 'Med',
        'methods': 'Methods',
        'molecular': 'Mol',
        'modern': 'Mod',
        'national': 'Natl',
        'planning': 'Plan',
        'practice': 'Pract',
        'proceedings': 'Proc',
        'psychology': 'Psychol',
        'public': 'Public',
        'quarterly': 'Q',
        'research': 'Res',
        'review': 'Rev',
        'science': 'Sci',
        'sciences': 'Sci',
        'social': 'Soc',
        'society': 'Soc',
        'studies': 'Stud',
        'study': 'Study',
        'sustainability': 'Sustain',
        'sustainable': 'Sustain',
        'systems': 'Syst',
        'technology': 'Technol',
        'theory': 'Theory',
        'urban': 'Urban',
        'university': 'Univ',
        'world': 'World',
    }
    JOURNAL_STOPWORDS = {'of', 'the', 'and', 'for', 'in', 'on', 'to', 'a', 'an'}
    TITLE_ACRONYMS = {
        'AI', 'AR', 'BIM', 'DNA', 'EU', 'GIS', 'HIV', 'IoT', 'LCA', 'ML', 'NLP',
        'RNA', 'UK', 'UN', 'USA', 'VR'
    }
    TITLE_PROPER_WORDS = {
        'africa', 'american', 'asia', 'australia', 'britain', 'british', 'china',
        'europe', 'european', 'india', 'indian', 'latin', 'london', 'new', 'york',
        'usa', 'united'
    }
    MEDICAL_TERMS = {
        'analgesia', 'antibiotic', 'biopsy', 'cardiovascular', 'comorbidity', 'cytokine', 'diagnosis',
        'differential diagnosis', 'dosage', 'etiology', 'hematology', 'histopathology', 'hypertension',
        'immunology', 'inflammation', 'intravenous', 'metastasis', 'morbidity', 'mortality', 'myocardial',
        'neurology', 'oncology', 'pathology', 'pharmacokinetics', 'pharmacology', 'physiology', 'prognosis',
        'radiology', 'randomized controlled trial', 'sepsis', 'serology', 'therapeutic', 'thrombosis',
        'toxicology', 'vaccine', 'viral load', 'in vitro', 'in vivo'
    }
    ENGINEERING_TERMS = {
        'algorithm', 'bandwidth', 'cad', 'cfd', 'compressive strength', 'control system', 'debugging',
        'finite element analysis', 'firmware', 'load bearing', 'mach number', 'manufacturability',
        'mechanical tolerance', 'microcontroller', 'modulus of elasticity', 'optimization', 'pid controller',
        'powertrain', 'prototype', 'quality assurance', 'reinforced concrete', 'requirements engineering',
        'signal processing', 'software architecture', 'specification', 'stress analysis', 'thermodynamics',
        'throughput', 'torque', 'validation', 'verification', 'voltage', 'weldability'
    }
    LEGAL_TERMS = {
        'affidavit', 'arbitration', 'burden of proof', 'case law', 'cause of action', 'civil procedure',
        'common law', 'contractual', 'cross-examination', 'damages', 'deposition', 'equity', 'estoppel',
        'habeas corpus', 'indemnity', 'injunction', 'jurisdiction', 'litigation', 'mens rea', 'actus reus',
        'negligence', 'plaintiff', 'precedent', 'prima facie', 'pro bono', 'res judicata', 'statutory',
        'sub judice', 'testimony', 'tort', 'ultra vires', 'verdict', 'writ'
    }
    FOREIGN_TERMS = {
        'et al', 'in vitro', 'in vivo', 'ad hoc', 'de facto', 'prima facie', 'inter alia',
        'per se', 'a priori', 'post hoc', 'vice versa', 'status quo', 'pro bono',
        'habeas corpus', 'mens rea', 'actus reus', 'sub judice', 'ultra vires',
        'mutatis mutandis', 'sui generis', 'ipso facto', 'ibid', 'cf'
    }
    FOREIGN_TERMS_ROMAN = {
        'et al', 'in vitro', 'in vivo', 'ad hoc', 'de facto', 'prima facie',
        'per se', 'a priori', 'post hoc', 'vice versa', 'status quo', 'pro bono',
        'ibid', 'cf'
    }
    FOREIGN_TERMS_ITALIC = FOREIGN_TERMS - FOREIGN_TERMS_ROMAN
    TITLE_SMALL_WORDS = {
        'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in',
        'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs'
    }
    JOURNAL_PROFILES = {
        'vancouver_nlm': {
            'label': 'Vancouver (NLM, no initial periods)',
            'initials_with_periods': False,
            'title_case': 'sentence',
            'journal_abbrev': 'nlm',
        },
        'vancouver_periods': {
            'label': 'Vancouver (Initial periods)',
            'initials_with_periods': True,
            'title_case': 'sentence',
            'journal_abbrev': 'nlm',
        },
        'vancouver_full': {
            'label': 'Vancouver (Full Journal Names)',
            'initials_with_periods': False,
            'title_case': 'sentence',
            'journal_abbrev': 'full',
        },
        'vancouver_periods_full': {
            'label': 'Vancouver (Initial Periods + Full Journal Names)',
            'initials_with_periods': True,
            'title_case': 'sentence',
            'journal_abbrev': 'full',
        },
        'vancouver_titlecase_nlm': {
            'label': 'Vancouver (Title Case Titles + NLM Journal Abbrev.)',
            'initials_with_periods': False,
            'title_case': 'title',
            'journal_abbrev': 'nlm',
        },
    }
    JOURNAL_PROFILE_ALIASES = {
        'vancouver': 'vancouver_periods',
        'vancouver_nlm': 'vancouver_nlm',
        'vancouver_periods': 'vancouver_periods',
        'vancouver_full': 'vancouver_full',
        'vancouver_full_journal': 'vancouver_full',
        'vancouver_periods_full': 'vancouver_periods_full',
        'vancouver_periods_full_journal': 'vancouver_periods_full',
        'vancouver_titlecase_nlm': 'vancouver_titlecase_nlm',
        'vancouver_title_case_nlm': 'vancouver_titlecase_nlm',
        'vancouver_titlecase': 'vancouver_titlecase_nlm',
    }

    def __init__(self):
        self.corrections: List[Dict] = []
        self.last_domain_profile: str = "general"
        self.last_domain_scores: Dict[str, int] = {"medical": 0, "engineering": 0, "law": 0}
        self.last_protected_domain_terms: int = 0
        self.last_custom_terms_count: int = 0

    def correct_all(self, text: str, options: Dict) -> str:
        """Apply all selected corrections."""
        self.corrections = []
        protected_text, protected_tokens = self._protect_invariant_tokens(text, options)
        result = protected_text

        if options.get('spelling', True):
            result = self.correct_spelling(result)

        if options.get('sentence_case', True):
            result = self.correct_sentence_case(result)

        if options.get('punctuation', True):
            result = self.correct_punctuation(result)

        if options.get('chicago_style', True):
            result = self.apply_chicago_style(result, options)

        return self._restore_invariant_tokens(result, protected_tokens)

    def _normalize_domain_profile(self, options: Optional[Dict]) -> str:
        """Resolve requested domain profile."""
        if not isinstance(options, dict):
            return "auto"
        profile = str(options.get("domain_profile", "auto")).strip().lower()
        if profile in ("auto", "general", "medical", "engineering", "law"):
            return profile
        return "auto"

    def _select_domain_terms(self, text: str, options: Optional[Dict]) -> set:
        """Pick a domain dictionary (or none) based on options and detected content."""
        profile = self._normalize_domain_profile(options)
        catalog = {
            "medical": self.MEDICAL_TERMS,
            "engineering": self.ENGINEERING_TERMS,
            "law": self.LEGAL_TERMS,
        }

        lower_text = (text or "").lower()
        scores: Dict[str, int] = {}
        for key, terms in catalog.items():
            hit = 0
            for term in terms:
                pattern = r'(?<!\w)' + re.escape(term.lower()) + r'(?!\w)'
                if re.search(pattern, lower_text):
                    hit += 1
            scores[key] = hit
        self.last_domain_scores = scores

        if profile in catalog:
            self.last_domain_profile = profile
            return set(catalog[profile])
        if profile == "general":
            self.last_domain_profile = "general"
            return set()

        best_profile = max(scores, key=scores.get) if scores else "general"
        if scores.get(best_profile, 0) >= 2:
            self.last_domain_profile = best_profile
            return set(catalog[best_profile])

        self.last_domain_profile = "general"
        return set()

    def _extract_custom_terms(self, options: Optional[Dict]) -> set:
        """Extract validated custom glossary terms from options payload."""
        if not isinstance(options, dict):
            self.last_custom_terms_count = 0
            return set()

        raw = options.get("custom_terms", [])
        terms: set = set()

        if isinstance(raw, str):
            candidates = re.split(r'[\n,;]+', raw)
        elif isinstance(raw, list):
            candidates = raw
        else:
            candidates = []

        for candidate in candidates:
            value = str(candidate).strip()
            if len(value) < 2 or len(value) > 80:
                continue
            terms.add(value)
            if len(terms) >= 500:
                break

        self.last_custom_terms_count = len(terms)
        return terms

    def get_journal_profile_catalog(self) -> List[Dict[str, str]]:
        """Return available journal profile options for UI/docs."""
        out: List[Dict[str, str]] = []
        for profile_id, profile in self.JOURNAL_PROFILES.items():
            out.append({
                "id": profile_id,
                "label": str(profile.get("label", profile_id)),
            })
        return out

    def resolve_journal_profile(self, options: Optional[Dict]) -> Dict[str, Any]:
        """Resolve selected journal profile, with backward-compatible aliases."""
        requested = ""
        if isinstance(options, dict):
            requested = str(
                options.get("journal_profile") or options.get("reference_profile") or "vancouver_periods"
            ).strip().lower()

        profile_id = self.JOURNAL_PROFILE_ALIASES.get(requested, requested)
        if profile_id not in self.JOURNAL_PROFILES:
            profile_id = "vancouver_periods"

        resolved = dict(self.JOURNAL_PROFILES[profile_id])
        resolved["id"] = profile_id
        return resolved

    def _protect_invariant_tokens(self, text: str, options: Optional[Dict] = None) -> Tuple[str, Dict[str, str]]:
        """Protect tokens that must remain byte-for-byte intact during editing."""
        replacements: Dict[str, str] = {}
        counter = 0
        masked = text
        domain_terms = self._select_domain_terms(text, options)
        custom_terms = self._extract_custom_terms(options)
        protected_terms = {
            term for term in (set(domain_terms) | set(custom_terms))
            if term.lower() not in self.FOREIGN_TERMS
        }
        self.last_protected_domain_terms = 0

        patterns = [
            # Full URLs.
            re.compile(r'(?i)\b(?:https?|ftp)://[^\s<>"\']+'),
            # Common bare web URLs.
            re.compile(r'(?i)\bwww\.[^\s<>"\']+'),
            # DOI with explicit label.
            re.compile(r'(?i)\bdoi:\s*10\.\d{4,9}/[^\s<>"\']+'),
            # Bare DOI token.
            re.compile(r'(?i)\b10\.\d{4,9}/[^\s<>"\']+'),
            # Emails.
            re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'),
        ]

        def make_replacer():
            nonlocal counter

            def repl(match):
                nonlocal counter
                token = match.group(0)
                trailing = ""
                while token and token[-1] in ".,;:!?":
                    trailing = token[-1] + trailing
                    token = token[:-1]

                placeholder = f"__INV_TOKEN_{counter}__"
                counter += 1
                replacements[placeholder] = token
                return placeholder + trailing

            return repl

        for pattern in patterns:
            masked = pattern.sub(make_replacer(), masked)

        if protected_terms:
            sorted_terms = sorted(protected_terms, key=len, reverse=True)
            for term in sorted_terms:
                pattern = re.compile(r'(?i)(?<!\w)' + re.escape(term) + r'(?!\w)')
                before = masked
                masked = pattern.sub(make_replacer(), masked)
                if masked != before:
                    self.last_protected_domain_terms += 1

        return masked, replacements

    def _restore_invariant_tokens(self, text: str, replacements: Dict[str, str]) -> str:
        """Restore protected tokens after normalization."""
        result = text
        for placeholder, original in replacements.items():
            result = result.replace(placeholder, original)
        return result

    def correct_spelling(self, text: str) -> str:
        """Fix common spelling errors."""
        words = re.findall(r'\b\w+\b', text)
        result = text

        for wrong, correct in self.PREFERRED_SPELLINGS.items():
            pattern = re.compile(r'\b' + re.escape(wrong) + r'\b', re.IGNORECASE)
            result = pattern.sub(correct, result)

        # Common homophone errors
        homophones = [
            (r'\bit\'s\b', "it's", r"it's", "it is"),
            (r'\bits\b', "its", r"its", "possessive"),
            (r'\btheir\b', "their", r"their", "possessive"),
            (r'\bthere\b', "there", r"there", "location"),
            (r'\bthey\'re\b', "they're", r"they're", "they are"),
            (r'\byou\'re\b', "you're", r"you're", "you are"),
            (r'\byour\b', "your", r"your", "possessive"),
            (r'\bloose\b', "lose", r"loose", "not tight"),
            (r'\blosing\b', "losing", r"losing", "verb"),
            (r'\brecieve\b', "receive", r"recieve", ""),
            (r'\boccured\b', "occurred", r"occured", ""),
            (r'\bseperate\b', "separate", r"seperate", ""),
            (r'\bdefinately\b', "definitely", r"definately", ""),
            (r'\buntill\b', "until", r"untill", ""),
            (r'\barguement\b', "argument", r"arguement", ""),
            (r'\boccurrance\b', "occurrence", r"occurrance", ""),
            (r'\bpersistant\b', "persistent", r"persistant", ""),
            (r'\brecommend\b', "recommend", r"recomend", ""),
            (r'\bembarrass\b', "embarrass", r"embarass", ""),
        ]

        for pattern_str, replacement, original, note in homophones:
            pattern = re.compile(pattern_str, re.IGNORECASE)
            result = pattern.sub(replacement, result)

        return result

    def correct_sentence_case(self, text: str) -> str:
        """Fix capitalization issues."""
        result = text

        # Fix first letter of document
        if result and result[0].islower():
            result = result[0].upper() + result[1:]

        # Fix sentence beginnings (after . ! ?)
        sentence_end = r'([.!?]\s+)'
        matches = list(re.finditer(sentence_end, result))

        for match in reversed(matches):
            gap = match.end()
            if gap < len(result):
                next_char = result[gap]
                if next_char.islower():
                    result = result[:gap] + next_char.upper() + result[gap+1:]

        # Capitalize weekdays and unambiguous month names. Ambiguous month
        # words like "may" and "march" need context so verbs/modal auxiliaries
        # are not promoted to proper nouns in body text.
        for day in self.WEEKDAY_NAMES:
            result = re.sub(r'\b' + day + r'\b', day.capitalize(), result, flags=re.IGNORECASE)

        for month in self.MONTH_NAMES:
            if month in self.AMBIGUOUS_MONTH_NAMES:
                continue
            result = re.sub(r'\b' + month + r'\b', month.capitalize(), result, flags=re.IGNORECASE)

        result = self._capitalize_ambiguous_month_references(result)

        return result

    def _capitalize_ambiguous_month_references(self, text: str) -> str:
        """Capitalize ambiguous month names only in date-like contexts."""
        result = text
        ambiguous = '|'.join(sorted(self.AMBIGUOUS_MONTH_NAMES))
        prepositions = (
            'in', 'on', 'by', 'during', 'through', 'throughout', 'from', 'until',
            'before', 'after', 'since', 'around', 'late', 'early', 'mid',
            'next', 'last', 'this', 'each', 'every'
        )
        preposition_pattern = '|'.join(prepositions)

        result = re.sub(
            rf'\b((?:{preposition_pattern})\s+)(?P<month>{ambiguous})\b',
            lambda match: match.group(1) + match.group('month').capitalize(),
            result,
            flags=re.IGNORECASE,
        )
        result = re.sub(
            rf'\b(?P<month>{ambiguous})(?=(?:\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,\s*\d{{4}})?)|\s+\d{{4}}\b)',
            lambda match: match.group('month').capitalize(),
            result,
            flags=re.IGNORECASE,
        )
        result = re.sub(
            rf'(\b\d{{1,2}}(?:st|nd|rd|th)?\s+of\s+)(?P<month>{ambiguous})\b',
            lambda match: match.group(1) + match.group('month').capitalize(),
            result,
            flags=re.IGNORECASE,
        )

        return result

    def correct_punctuation(self, text: str) -> str:
        """Refine punctuation per Chicago style."""
        result = text

        # Fix double spaces
        result = re.sub(r'  +', ' ', result)

        # Fix spacing around punctuation
        result = re.sub(r'\s+([.,;:!?])', r'\1', result)
        # Add missing spaces after punctuation that should typically be followed by a space.
        result = re.sub(r'([,;:!?])(?!\s)(?=[^\s])', r'\1 ', result)
        # Add missing space after sentence-ending period when followed by uppercase.
        result = re.sub(r'(?<=[a-z0-9])\.(?=[A-Z])', '. ', result)

        # Ensure em-dash has no spaces (Chicago style)
        result = re.sub(r'\s*--\s*', '—', result)

        # Ensure proper ellipsis (three dots, not ..., . . ., etc.)
        result = re.sub(r'\.{3,}', '...', result)
        result = re.sub(r'(?<!\.)\.(?!\.)\s*\.\s*(?!\.)', '...', result)

        # Fix quotation marks to straight quotes (simplified)
        result = re.sub(r'[""]', '"', result)
        result = re.sub(r"['']", "'", result)

        return result

    def apply_chicago_style(self, text: str, options: Optional[Dict] = None) -> str:
        """Apply broader Chicago Manual of Style formatting."""
        result = text

        # Normalize word-number markers before citation/author formatting.
        result = self.normalize_word_number_markers(result)
        # Collapse mixed author-year + bracket citation forms into numeric-only citation blocks.
        result = self.collapse_mixed_parenthetical_citations(result)
        # Keep numeric citation format stable.
        result = self.normalize_numeric_citations(result)
        # Merge adjacent bracket citations like [9] [19] -> [9, 19].
        result = self.merge_adjacent_numeric_citations(result)
        # Use superscript for author affiliation/index markers.
        result = self.format_author_markers_as_superscript(result)
        # Normalize author-line names/titles and place affiliation marker after author name.
        result = self.normalize_author_line_name_markers(result)
        # Keep common foreign terms in lowercase form.
        result = self.normalize_foreign_terms(result)
        # Prefer scientific styling for percentages.
        result = self.normalize_scientific_percentages(result)
        # Prefer numerals with abbreviated scientific measurements.
        result = self.normalize_measurement_numerals(result)
        # Ensure keyword lines use sentence case per item.
        result = self.normalize_keywords_line(result)
        # Enforce Vancouver numbering so citations and references follow first appearance.
        result = self.format_references_vancouver_numbered(result, options or {})

        return result

    def _word_to_number(self, raw: str) -> int:
        """Convert a small English number phrase (0-99) to integer."""
        token = raw.strip().lower().replace('-', ' ')
        if token in self.NUMBER_WORDS:
            return self.NUMBER_WORDS[token]

        parts = [p for p in token.split() if p]
        if len(parts) == 2 and parts[0] in self.NUMBER_WORDS and parts[1] in self.NUMBER_WORDS:
            return self.NUMBER_WORDS[parts[0]] + self.NUMBER_WORDS[parts[1]]

        raise ValueError(f"Unsupported number word: {raw}")

    def normalize_word_number_markers(self, text: str) -> str:
        """Convert citation/author number words (e.g., [nine], one.) to digits."""
        word_pattern = (
            r'(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|'
            r'thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|'
            r'thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|'
            r'four|five|six|seven|eight|nine))?'
        )

        # [nine] -> [9]
        def citation_word_repl(match):
            raw = match.group(1)
            try:
                return f'[{self._word_to_number(raw)}]'
            except ValueError:
                return match.group(0)

        text = re.sub(r'\[\s*(' + word_pattern + r')\s*\]', citation_word_repl, text, flags=re.IGNORECASE)

        # "one. Dr. ..." -> "1. Dr. ..."
        def author_marker_repl(match):
            raw = match.group(1)
            try:
                return f'{self._word_to_number(raw)}. '
            except ValueError:
                return match.group(0)

        text = re.sub(
            r'\b(' + word_pattern + r')\s*\.\s*(?=(?:Dr|Ar|Prof|Professor|Mr|Mrs|Ms)\.?\s)',
            author_marker_repl,
            text,
            flags=re.IGNORECASE
        )

        # Leading affiliation marker lists: "one, three, Assistant..." -> "1,3, Assistant..."
        def line_start_list_repl(match):
            markers = match.group(1)
            converted = []
            for part in re.split(r'\s*,\s*', markers):
                try:
                    converted.append(str(self._word_to_number(part)))
                except ValueError:
                    return match.group(0)
            return ','.join(converted) + ', '

        text = re.sub(
            r'^\s*((?:' + word_pattern + r')(?:\s*,\s*' + word_pattern + r')+)\s*,\s+',
            line_start_list_repl,
            text,
            flags=re.IGNORECASE | re.MULTILINE
        )

        return text

    def normalize_numeric_citations(self, text: str) -> str:
        """Normalize citation blocks like [1] or [1,2,3]."""
        def repl(match):
            nums = [n.strip() for n in match.group(1).split(',') if n.strip()]
            return '[' + ', '.join(nums) + ']'

        return re.sub(r'\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]', repl, text)

    def collapse_mixed_parenthetical_citations(self, text: str) -> str:
        """Convert mixed forms like '(Author, 1995 [9]) [19]' into '[9, 19]'."""
        citation_pattern = re.compile(
            r'\(([^()]*\[\s*\d+(?:\s*,\s*\d+)*\s*\][^()]*)\)\s*(\[\s*\d+(?:\s*,\s*\d+)*\s*\])?',
            flags=re.MULTILINE
        )

        def parse_nums(fragment: str) -> List[str]:
            values: List[str] = []
            for grp in re.findall(r'\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]', fragment):
                for part in grp.split(','):
                    number = part.strip()
                    if number and number not in values:
                        values.append(number)
            return values

        def repl(match):
            inside = match.group(1) or ''
            trailing = match.group(2) or ''
            nums = parse_nums(inside + ' ' + trailing)
            if not nums:
                return match.group(0)
            return '[' + ', '.join(nums) + ']'

        return citation_pattern.sub(repl, text)

    def merge_adjacent_numeric_citations(self, text: str) -> str:
        """Merge adjacent numeric citation blocks into one normalized citation list."""
        pattern = re.compile(
            r'\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]\s*\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]'
        )

        def repl(match):
            left = [n.strip() for n in match.group(1).split(',') if n.strip()]
            right = [n.strip() for n in match.group(2).split(',') if n.strip()]
            merged: List[str] = []
            for n in left + right:
                if n not in merged:
                    merged.append(n)
            return '[' + ', '.join(merged) + ']'

        previous = None
        current = text
        while previous != current:
            previous = current
            current = pattern.sub(repl, current)
        return current

    def format_author_markers_as_superscript(self, text: str) -> str:
        """Convert author affiliation markers like `1. Dr.` to superscript digits."""
        def repl(match):
            number = match.group(1).translate(self.SUPERSCRIPT_MAP)
            return f'{number} '

        return re.sub(
            r'\b(\d{1,2})\s*\.\s*(?=(?:Dr|Ar|Prof|Professor|Mr|Mrs|Ms)\.?\s)',
            repl,
            text
        )

    def normalize_author_line_name_markers(self, text: str) -> str:
        """Normalize author front-matter lines to 'Name²*' style and remove titles."""
        title_re = re.compile(r'^(?:(?:Ar|Dr|Prof|Professor|Mr|Mrs|Ms)\.?\s+)+', flags=re.IGNORECASE)
        leading_marker_re = re.compile(r'^\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]+|\d{1,2})(?:\s*[.)])?\s*')
        trailing_marker_re = re.compile(r'\s*([⁰¹²³⁴⁵⁶⁷⁸⁹]+|\d{1,2})\s*$')

        def to_superscript(raw: str) -> str:
            token = raw.strip()
            if not token:
                return ''
            if re.fullmatch(r'[⁰¹²³⁴⁵⁶⁷⁸⁹]+', token):
                return token
            if token.isdigit():
                return token.translate(self.SUPERSCRIPT_MAP)
            return token

        def normalize_segment(segment: str) -> str:
            src = segment.strip()
            if not src:
                return src

            marker = ''
            stars = ''

            lead = leading_marker_re.match(src)
            if lead:
                marker = to_superscript(lead.group(1))
                src = src[lead.end():].strip()

            src = title_re.sub('', src).strip()

            star_match = re.search(r'(\*+)\s*$', src)
            if star_match:
                stars = star_match.group(1)
                src = src[:star_match.start()].strip()

            trail = trailing_marker_re.search(src)
            if trail:
                if not marker:
                    marker = to_superscript(trail.group(1))
                src = src[:trail.start()].strip()

            src = re.sub(r'\s+', ' ', src).strip(' ,;')
            if not src:
                return segment.strip()

            return f'{src}{marker}{stars}'

        output_lines: List[str] = []
        for line in text.split('\n'):
            stripped = line.strip()
            if not stripped:
                output_lines.append(line)
                continue

            # Conservative trigger for author-name lines.
            if (
                ',' in stripped and
                re.search(r'\b(?:Ar|Dr|Prof|Professor|Mr|Mrs|Ms)\.?\b', stripped, flags=re.IGNORECASE)
            ):
                parts = [part.strip() for part in line.split(',')]
                normalized_parts = [normalize_segment(part) for part in parts]
                output_lines.append(', '.join(normalized_parts))
                continue

            output_lines.append(line)

        return '\n'.join(output_lines)

    def normalize_keywords_line(self, text: str) -> str:
        """Normalize `Keyword:` / `Keywords:` lines with sentence-case items."""
        def normalize_item(item: str) -> str:
            item = item.strip()
            if not item:
                return item
            if len(item) <= 4 and item.isupper():
                return item
            return item[0].upper() + item[1:].lower() if len(item) > 1 else item.upper()

        output_lines = []
        for line in text.split('\n'):
            match = re.match(r'^(\s*keywords?\s*:\s*)(.*)$', line, flags=re.IGNORECASE)
            if not match:
                output_lines.append(line)
                continue

            prefix = "Keyword: "
            items = [normalize_item(part) for part in match.group(2).split(',')]
            output_lines.append(prefix + ', '.join(items))

        return '\n'.join(output_lines)

    def normalize_foreign_terms(self, text: str) -> str:
        """Normalize known non-English scholarly terms to lowercase."""
        result = text
        for term in sorted(self.FOREIGN_TERMS, key=len, reverse=True):
            pattern = re.compile(r'(?i)(?<!\w)' + re.escape(term) + r'(?!\w)')
            result = pattern.sub(term.lower(), result)
        return result

    def get_foreign_term_style_catalog(self) -> Dict[str, List[str]]:
        """Return foreign-term categories for Chicago-style rendering decisions."""
        return {
            "roman": sorted(self.FOREIGN_TERMS_ROMAN, key=len, reverse=True),
            "italic": sorted(self.FOREIGN_TERMS_ITALIC, key=len, reverse=True),
        }

    def normalize_scientific_percentages(self, text: str) -> str:
        """Convert scientific percentage expressions to numeral + % form."""
        word_pattern = (
            r'(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|'
            r'thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|'
            r'thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|'
            r'four|five|six|seven|eight|nine))?'
        )

        def repl(match):
            raw_number = match.group(1)
            if raw_number.isdigit():
                return f"{raw_number}%"
            try:
                return f"{self._word_to_number(raw_number)}%"
            except ValueError:
                return match.group(0)

        pattern = re.compile(
            r'(?i)\b(' + word_pattern + r'|\d+)\s+percent\b'
        )
        return pattern.sub(repl, text)

    def normalize_measurement_numerals(self, text: str) -> str:
        """Convert spelled-out numbers before abbreviated measurements into numerals."""
        word_pattern = (
            r'(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|'
            r'thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|'
            r'thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|'
            r'four|five|six|seven|eight|nine))?'
        )
        unit_pattern = '|'.join(sorted((re.escape(unit) for unit in self.MEASUREMENT_UNITS), key=len, reverse=True))

        def repl(match):
            raw_number = match.group(1)
            unit = match.group(2)
            try:
                return f"{self._word_to_number(raw_number)} {unit}"
            except ValueError:
                return match.group(0)

        pattern = re.compile(
            r'(?i)\b(' + word_pattern + r')\s+(' + unit_pattern + r')\b'
        )
        return pattern.sub(repl, text)

    def _normalize_author_name(self, name: str, profile: Dict[str, Any]) -> str:
        """Normalize a single author token to Vancouver-style surname + initials."""
        candidate = re.sub(r'\s+', ' ', name or '').strip().strip('.,;')
        if not candidate:
            return ''

        if re.fullmatch(r'et\s+al\.?', candidate, flags=re.IGNORECASE):
            return 'et al'

        if ',' in candidate:
            left, right = candidate.split(',', 1)
            left = left.strip()
            right = right.strip()
            if left and right:
                candidate = f'{left} {right}'

        tokens = [t for t in candidate.split(' ') if t]
        if not tokens:
            return candidate

        surname = tokens[0]
        initials: List[str] = []
        tail_words: List[str] = []

        for token in tokens[1:]:
            clean = re.sub(r'[^A-Za-z]', '', token)
            if not clean:
                continue
            if len(clean) == 1:
                initials.append(clean.upper())
                continue
            if len(clean) <= 4 and clean.isupper():
                initials.extend(list(clean))
                continue
            # Keep full words if present; they are likely unresolved given names.
            tail_words.append(clean)

        if bool(profile.get("initials_with_periods")):
            initial_text = ''.join(f'{letter}.' for letter in initials)
        else:
            initial_text = ''.join(initials)

        out = surname
        if initial_text:
            out += f' {initial_text}'
        if tail_words:
            out += ' ' + ' '.join(tail_words)
        return out.strip()

    def _normalize_author_block(self, authors: str, profile: Dict[str, Any]) -> str:
        """Normalize a full author block while preserving order."""
        source = re.sub(r'\s+and\s+', ', ', authors, flags=re.IGNORECASE)
        source = re.sub(r'\s+', ' ', source).strip().strip('.,;')
        if not source:
            return source

        raw_parts = [p.strip() for p in source.split(',') if p.strip()]
        if len(raw_parts) == 2:
            second_clean = re.sub(r'[^A-Za-z]', '', raw_parts[1])
            # Handle single-author "Surname, Initials" form.
            if second_clean.isupper() and 1 <= len(second_clean) <= 4:
                parts = [f'{raw_parts[0]} {raw_parts[1]}']
            else:
                parts = raw_parts
        else:
            parts = raw_parts

        normalized: List[str] = []
        for part in parts:
            normalized_part = self._normalize_author_name(part, profile)
            if normalized_part:
                normalized.append(normalized_part)

        if not normalized:
            return source

        if len(normalized) > 6 and not any(p.lower() == 'et al' for p in normalized):
            normalized = normalized[:1] + ['et al']

        return ', '.join(normalized)

    def _sentence_case_title(self, title: str) -> str:
        """Convert title to sentence case while preserving acronyms."""
        text = re.sub(r'\s+', ' ', title or '').strip().strip('.,;')
        if not text:
            return text

        tokens = re.split(r'(\s+)', text)
        out: List[str] = []
        first_alpha_done = False

        for token in tokens:
            if not token or token.isspace():
                out.append(token)
                continue

            match = re.match(r'^([^A-Za-z]*)([A-Za-z][A-Za-z\'\-]*)([^A-Za-z]*)$', token)
            if not match:
                out.append(token)
                continue

            prefix, word, suffix = match.groups()
            if word.isupper() and len(word) > 1:
                if word in self.TITLE_ACRONYMS:
                    normalized = word
                else:
                    normalized = word.lower()
                    if normalized in self.TITLE_PROPER_WORDS:
                        normalized = normalized.capitalize()
                    if not first_alpha_done:
                        normalized = normalized.capitalize()
            elif any(ch.isupper() for ch in word[1:]):
                normalized = word
            else:
                normalized = word.lower()
                if normalized in self.TITLE_PROPER_WORDS:
                    normalized = normalized.capitalize()
                if not first_alpha_done:
                    normalized = normalized.capitalize()

            if not first_alpha_done and re.search(r'[A-Za-z]', word):
                first_alpha_done = True

            out.append(prefix + normalized + suffix)

        return ''.join(out).strip()

    def _title_case_title(self, title: str) -> str:
        """Convert title to title case while preserving acronyms/proper words."""
        text = re.sub(r'\s+', ' ', title or '').strip().strip('.,;')
        if not text:
            return text

        tokens = re.split(r'(\s+)', text)
        alpha_positions = [idx for idx, tok in enumerate(tokens) if re.search(r'[A-Za-z]', tok or "")]
        if not alpha_positions:
            return text

        first_alpha_idx = alpha_positions[0]
        last_alpha_idx = alpha_positions[-1]
        out: List[str] = []

        for idx, token in enumerate(tokens):
            if not token or token.isspace():
                out.append(token)
                continue

            match = re.match(r'^([^A-Za-z]*)([A-Za-z][A-Za-z\'\-]*)([^A-Za-z]*)$', token)
            if not match:
                out.append(token)
                continue

            prefix, word, suffix = match.groups()
            lower = word.lower()

            if word in self.TITLE_ACRONYMS or (word.isupper() and len(word) > 1):
                normalized = word
            elif lower in self.TITLE_PROPER_WORDS:
                normalized = lower.capitalize()
            elif idx not in (first_alpha_idx, last_alpha_idx) and lower in self.TITLE_SMALL_WORDS:
                normalized = lower
            elif any(ch.isupper() for ch in word[1:]):
                normalized = word
            else:
                normalized = lower.capitalize()

            out.append(prefix + normalized + suffix)

        return ''.join(out).strip()

    def _abbreviate_journal_name(self, journal: str) -> str:
        """Abbreviate journal title using a deterministic NLM-like word map."""
        text = re.sub(r'\s+', ' ', journal or '').strip().strip('.,;')
        if not text:
            return text

        tokens = [t for t in text.split(' ') if t]
        result: List[str] = []

        for idx, token in enumerate(tokens):
            core = re.sub(r'[^A-Za-z&\-]', '', token)
            if not core:
                continue
            lower = core.lower()

            if idx > 0 and lower in self.JOURNAL_STOPWORDS:
                continue
            if lower in self.JOURNAL_ABBREVIATIONS:
                result.append(self.JOURNAL_ABBREVIATIONS[lower])
                continue
            if core.isupper():
                result.append(core)
                continue
            result.append(core.capitalize())

        return ' '.join(result).strip()

    def _normalize_reference_tail(self, tail: str) -> str:
        """Normalize trailing citation metadata to house journal style."""
        text = re.sub(r'\s+', ' ', tail or '').strip()
        if not text:
            return text

        doi_match = re.search(r'(?i)\b(?:doi:\s*)?(10\.\d{4,9}/[^\s<>"\']+)', text)
        doi_value = doi_match.group(1).rstrip('.,;') if doi_match else ''
        text_without_doi = text[:doi_match.start()].strip() if doi_match else text
        text_without_doi = text_without_doi.rstrip('.,; ')

        year_match = re.search(r'\b((?:19|20)\d{2})\b', text_without_doi)
        if not year_match:
            fallback = re.sub(r'\bdoi\s*:\s*', 'doi: ', text, flags=re.IGNORECASE)
            fallback = re.sub(r'\s{2,}', ' ', fallback).strip()
            return fallback

        year = year_match.group(1)
        remainder = text_without_doi[year_match.end():].strip()
        remainder = re.sub(r'^[A-Za-z]{3,9}\b(?:\s+\d{1,2})?,?\s*', '', remainder)
        remainder = re.sub(r'^\s*;\s*', '', remainder)
        remainder = re.sub(r'\s+', ' ', remainder).strip().rstrip('.')
        remainder = re.sub(r'\s*:\s*', ':', remainder)

        pieces = [f'{year} ;{remainder}' if remainder else year]
        if doi_value:
            pieces.append(f'doi: {doi_value}')
        return '. '.join(piece.rstrip('.').strip() for piece in pieces if piece).strip()

    def _missing_placeholder(self, field_label: str) -> str:
        """Return stable bracketed placeholder text for missing metadata."""
        return f'[{field_label} missing]'

    def _strip_missing_placeholders(self, text: str) -> str:
        """Remove synthetic missing-field placeholders before reparsing text."""
        cleaned = self.MISSING_PLACEHOLDER_RE.sub('', text or '')
        cleaned = re.sub(r'\s{2,}', ' ', cleaned)
        cleaned = re.sub(r'\s+([,;:.])', r'\1', cleaned)
        return cleaned.strip()

    def _detect_reference_source_type(self, entry: str, authors: str, title: str, journal: str, tail: str) -> str:
        """Classify a reference into coarse NLM source types for validation."""
        candidate = self._strip_missing_placeholders(re.sub(r'\s+', ' ', entry or '').strip())
        if re.search(r'(?i)(?:^|[.])\s*In:?\s+', candidate):
            return "chapter"
        if re.search(r'(?i)\[Internet\]|Available from:|https?://|www\.', candidate):
            return "website"
        if re.search(
            r'\)\.\s*[^.]+\.\s*[^,]+,\s*[A-Za-z]?\d+(?:\([^)]+\))?\s*,\s*[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?',
            candidate
        ):
            return "journal"
        if re.search(r'\b(?:19|20)\d{2}(?:\s+[A-Za-z]{3,9}(?:\s+\d{1,2})?)?\s*;\s*[A-Za-z]?\d+(?:\([^)]+\))?', candidate):
            return "journal"
        if re.search(r':\s*[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?\b', candidate) and journal:
            return "journal"
        if re.search(r'(?i)\b(?:doi:\s*)?10\.\d{4,9}/[^\s<>"\']+', candidate):
            return "journal"
        if re.search(r'(?i)\b\d+(?:st|nd|rd|th)\s+ed\.?\b', candidate):
            return "book"
        if re.search(r'[^.;\[\]]+:\s*[^.;\[\]]+(?:\s*;\s*(?:19|20)\d{2})?', candidate):
            return "book"
        if journal and re.search(r'(?i)\b(?:j|journal|int|international|proc|proceedings|med|clin|res|rev|sci|test)\b', journal):
            return "journal"
        if tail and re.fullmatch(r'(?:19|20)\d{2}\.?', tail.strip()):
            return "book"
        if journal and tail:
            return "journal"
        if tail:
            return "book"
        if authors or title:
            return "book"
        return "generic"

    def _analyze_reference_entry(self, entry: str) -> Dict[str, Any]:
        """Return parsed reference metadata for source-type-aware validation."""
        candidate = self._strip_missing_placeholders(re.sub(r'\s+', ' ', entry or '').strip())
        authors, title, journal, tail = self._split_reference_entry_parts(candidate)
        source_type = self._detect_reference_source_type(candidate, authors, title, journal, tail)

        if source_type == "chapter":
            chapter_parts = re.split(r'(?i)\bIn:\s*', candidate, maxsplit=1)
            prefix = chapter_parts[0].strip()
            suffix = chapter_parts[1].strip() if len(chapter_parts) > 1 else ""
            prefix_segments = [
                part.strip().strip('.,;')
                for part in re.split(r'\.\s+(?=[A-Za-z])', prefix)
                if part.strip()
            ]
            authors = prefix_segments[0] if prefix_segments else ""
            title = prefix_segments[1] if len(prefix_segments) > 1 else ""
            journal = suffix

        place_publisher_match = re.search(
            r'(?P<place>[^.;\[\]]+?)\s*:\s*(?P<publisher>[^.;\[\]]+?)(?:\s*;\s*(?P<year>(?:19|20)\d{2}))?(?=(?:\s*\[cited|\s*Available from:|\.|$))',
            candidate,
            flags=re.IGNORECASE,
        )
        publisher_year_match = re.search(
            r'(?P<publisher>[^.;\[\]]+?)\s*;\s*(?P<year>(?:19|20)\d{2})(?=(?:\s*\[cited|\s*Available from:|\.|$))',
            candidate,
            flags=re.IGNORECASE,
        )
        year_match = re.search(r'\b(?:19|20)\d{2}\b', candidate)
        volume_match = re.search(
            r'\b(?:19|20)\d{2}(?:\s+[A-Za-z]{3,9}(?:\s+\d{1,2})?)?\s*;\s*(?P<volume>[A-Za-z]?\d+(?:\([^)]+\))?)',
            candidate
        ) or re.search(
            r'\)\.\s*[^.]+\.\s*[^,]+,\s*(?P<volume>[A-Za-z]?\d+(?:\([^)]+\))?)\s*,\s*[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?',
            candidate
        )
        page_match = re.search(
            r'(?::\s*(?P<pages>[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?))\b',
            candidate,
        ) or re.search(
            r',\s*[A-Za-z]?\d+(?:\([^)]+\))?\s*,\s*(?P<pages>[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?)\b',
            candidate,
        ) or re.search(r'(?i)\bp(?:p)?\.?\s*(?P<pages>\d+(?:\s*[-–]\s*\d+)?)\b', candidate)
        cited_match = re.search(r'(?i)\[cited [^\]]+\]', candidate)
        url_match = re.search(r'(?i)(https?://\S+|www\.\S+)', candidate)
        doi_match = re.search(r'(?i)\b(?:doi:\s*)?10\.\d{4,9}/[^\s<>"\']+', candidate)
        has_editor = re.search(r'(?i)\b(?:ed\.|eds\.|editor|editors)\b', candidate) is not None

        return {
            "entry": candidate,
            "source_type": source_type,
            "authors": authors,
            "title": title,
            "journal": journal,
            "tail": tail,
            "year": year_match.group(0) if year_match else "",
            "volume": volume_match.group("volume") if volume_match and volume_match.groupdict().get("volume") else "",
            "pages": page_match.group("pages") if page_match and page_match.groupdict().get("pages") else "",
            "url": url_match.group(1).rstrip(".,;") if url_match else "",
            "doi": doi_match.group(0).replace("doi:", "").strip().rstrip(".,;") if doi_match else "",
            "has_author": bool(re.search(r'[A-Za-z]', authors or "")),
            "has_title": bool(re.search(r'[A-Za-z]', title or "")),
            "has_journal": bool(re.search(r'[A-Za-z]', journal or "")),
            "has_year": year_match is not None,
            "has_volume": volume_match is not None,
            "has_pages": page_match is not None,
            "has_doi": doi_match is not None,
            "has_url": url_match is not None,
            "has_cited_date": cited_match is not None,
            "has_editor": has_editor,
            "has_place": bool(place_publisher_match and re.search(r'[A-Za-z]', place_publisher_match.group('place') or "")),
            "has_publisher": bool(
                (place_publisher_match and re.search(r'[A-Za-z]', place_publisher_match.group('publisher') or ""))
                or (publisher_year_match and re.search(r'[A-Za-z]', publisher_year_match.group('publisher') or ""))
            ),
        }

    def _reference_missing_specs(self, metadata: Dict[str, Any]) -> List[Dict[str, str]]:
        """Return required-field rules for a reference based on detected source type."""
        source_type = str(metadata.get("source_type") or "generic")
        has_contributor = bool(metadata.get("has_author")) or bool(metadata.get("has_editor"))

        if source_type == "journal":
            checks = [
                ("author", "reference_missing_author", "reference_missing_author_numbers", bool(metadata.get("has_author"))),
                ("title", "reference_missing_title", "reference_missing_title_numbers", bool(metadata.get("has_title"))),
                ("journal", "reference_missing_journal", "reference_missing_journal_numbers", bool(metadata.get("has_journal"))),
                ("year", "reference_missing_year", "reference_missing_year_numbers", bool(metadata.get("has_year"))),
                ("volume", "reference_missing_volume", "reference_missing_volume_numbers", bool(metadata.get("has_volume"))),
                ("page", "reference_missing_pages", "reference_missing_pages_numbers", bool(metadata.get("has_pages"))),
            ]
        elif source_type == "website":
            checks = [
                ("author", "reference_missing_author", "reference_missing_author_numbers", has_contributor),
                ("title", "reference_missing_title", "reference_missing_title_numbers", bool(metadata.get("has_title"))),
                ("year", "reference_missing_year", "reference_missing_year_numbers", bool(metadata.get("has_year"))),
                ("cited date", "reference_missing_cited_date", "reference_missing_cited_date_numbers", bool(metadata.get("has_cited_date"))),
                ("url", "reference_missing_url", "reference_missing_url_numbers", bool(metadata.get("has_url"))),
            ]
        elif source_type == "chapter":
            checks = [
                ("author", "reference_missing_author", "reference_missing_author_numbers", bool(metadata.get("has_author"))),
                ("title", "reference_missing_title", "reference_missing_title_numbers", bool(metadata.get("has_title"))),
                ("editor", "reference_missing_editor", "reference_missing_editor_numbers", bool(metadata.get("has_editor"))),
                ("place", "reference_missing_place", "reference_missing_place_numbers", bool(metadata.get("has_place"))),
                ("publisher", "reference_missing_publisher", "reference_missing_publisher_numbers", bool(metadata.get("has_publisher"))),
                ("year", "reference_missing_year", "reference_missing_year_numbers", bool(metadata.get("has_year"))),
                ("page", "reference_missing_pages", "reference_missing_pages_numbers", bool(metadata.get("has_pages"))),
            ]
        else:
            checks = [
                ("author", "reference_missing_author", "reference_missing_author_numbers", has_contributor),
                ("title", "reference_missing_title", "reference_missing_title_numbers", bool(metadata.get("has_title"))),
                ("place", "reference_missing_place", "reference_missing_place_numbers", bool(metadata.get("has_place"))),
                ("publisher", "reference_missing_publisher", "reference_missing_publisher_numbers", bool(metadata.get("has_publisher"))),
                ("year", "reference_missing_year", "reference_missing_year_numbers", bool(metadata.get("has_year"))),
            ]

        return [
            {"label": label, "code": code, "detail_key": detail_key}
            for label, code, detail_key, present in checks
            if not present
        ]

    def _split_reference_entry_parts(self, entry: str) -> Tuple[str, str, str, str]:
        """Split one reference into (authors, title, journal, tail)."""
        candidate = self._strip_missing_placeholders(re.sub(r'\s+', ' ', entry or '').strip())
        if not candidate:
            return "", "", "", ""

        apa_journal_match = re.match(
            r'^(?P<authors>.+?)\s*\((?P<year>(?:19|20)\d{2})\)\.\s*'
            r'(?P<title>.+?)\.\s*'
            r'(?P<journal>.+?),\s*'
            r'(?P<volume>[A-Za-z]?\d+(?:\([^)]+\))?)\s*,\s*'
            r'(?P<pages>[A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?)'
            r'\.?\s*(?P<rest>.*)$',
            candidate,
        )
        if apa_journal_match:
            authors = apa_journal_match.group('authors').strip().strip('.,;')
            title = apa_journal_match.group('title').strip().strip('.,;')
            journal = apa_journal_match.group('journal').strip().strip('.,;')
            tail = f"{apa_journal_match.group('year')} ;{apa_journal_match.group('volume')}:{apa_journal_match.group('pages')}"
            rest = str(apa_journal_match.group('rest') or '').strip().strip('.,;')
            if rest:
                tail += f". {rest}"
            return authors, title, journal, tail

        author_year_title_url_match = re.match(
            r'^(?P<authors>.+?)\s*(?:\((?P<year1>(?:19|20)\d{2})\)|(?P<year2>(?:19|20)\d{2}))'
            r'[.;]?\s*(?P<title>.+?)\.\s*(?P<url>(?:https?://\S+|www\.\S+))\.?$',
            candidate,
            flags=re.IGNORECASE,
        )
        if author_year_title_url_match:
            authors = author_year_title_url_match.group('authors').strip().strip('.,;')
            title = author_year_title_url_match.group('title').strip().strip('.,;')
            year = str(author_year_title_url_match.group('year1') or author_year_title_url_match.group('year2') or '').strip()
            url = str(author_year_title_url_match.group('url') or '').strip()
            tail = year
            if url:
                tail = f"{tail}. Available from: {url}" if tail else f"Available from: {url}"
            return authors, title, "", tail

        year_match = re.search(r'\b(?:19|20)\d{2}\b', candidate)
        if year_match:
            before_year = candidate[:year_match.start()].strip().strip('.,;')
            tail = candidate[year_match.start():].strip()
        else:
            before_year = candidate.strip().strip('.,;')
            tail = ''

        segments = [
            part.strip().strip('.,;')
            for part in re.split(r'\.\s+(?=[A-Za-z])', before_year)
            if part.strip()
        ]
        authors = segments[0] if segments else before_year
        title = segments[1] if len(segments) > 1 else ''
        journal = '. '.join(segments[2:]) if len(segments) > 2 else ''
        return authors, title, journal, tail

    def _format_reference_title(self, title: str, profile: Dict[str, Any]) -> str:
        """Format reference title by selected profile rule."""
        mode = str(profile.get("title_case", "sentence")).strip().lower()
        if mode == "title":
            return self._title_case_title(title)
        return self._sentence_case_title(title)

    def _format_reference_journal(self, journal: str, profile: Dict[str, Any]) -> str:
        """Format journal title (NLM abbreviation or full title) by profile."""
        mode = str(profile.get("journal_abbrev", "nlm")).strip().lower()
        if mode == "full":
            return self._title_case_title(journal)
        return self._abbreviate_journal_name(journal)

    def _normalize_reference_entry(self, entry: str, profile: Dict[str, Any]) -> str:
        """Normalize a single reference entry to configured Vancouver style."""
        candidate = self._strip_missing_placeholders(re.sub(r'\s+', ' ', entry or '').strip())
        if not candidate:
            return candidate

        metadata = self._analyze_reference_entry(candidate)
        authors, title, journal, tail = self._split_reference_entry_parts(candidate)

        if str(metadata.get("source_type") or "") == "journal":
            authors_norm = self._normalize_author_block(authors, profile)
            title_norm = self._format_reference_title(title, profile) if title else ''
            journal_norm = self._format_reference_journal(journal, profile) if journal else ''
            tail_norm = self._normalize_reference_tail(tail)

            third_segment = ''
            if journal_norm and tail_norm:
                third_segment = f'{journal_norm.rstrip(".")}. {tail_norm}'.strip()
            elif journal_norm:
                third_segment = journal_norm
            else:
                third_segment = tail_norm

            pieces = [p.rstrip('.') for p in [authors_norm, title_norm, third_segment] if p]
            normalized = '. '.join(pieces).strip()
            normalized = re.sub(r'\s+([,:.])', r'\1', normalized)
            normalized = re.sub(r'\s{2,}', ' ', normalized).strip()
        else:
            normalized = candidate
            if authors:
                authors_norm = self._normalize_author_block(authors, profile)
                if authors_norm and normalized.startswith(authors):
                    remainder = normalized[len(authors):]
                    if authors_norm.endswith('.') and remainder.startswith('.'):
                        remainder = remainder[1:]
                    normalized = (authors_norm + remainder).strip()
            normalized = re.sub(r'(?i)\[internet\]', '[Internet]', normalized)
            normalized = re.sub(r'(?i)available from:', 'Available from:', normalized)
            normalized = re.sub(r'\s{2,}', ' ', normalized).strip()

        if normalized and not normalized.endswith('.'):
            normalized += '.'
        return self._inject_missing_placeholders_inline(normalized, metadata)

    def _inject_missing_placeholders_inline(self, text: str, metadata: Dict[str, Any]) -> str:
        """Insert missing-field placeholders near their expected field position."""
        result = re.sub(r'\s+', ' ', text or '').strip()
        if not result:
            return result

        for spec in self._reference_missing_specs(metadata):
            label = str(spec.get("label") or "")
            code = str(spec.get("code") or "")
            placeholder = self._missing_placeholder(label)
            if placeholder.lower() in result.lower():
                continue
            result = self._insert_missing_placeholder(result, code, placeholder)

        result = re.sub(r'\s{2,}', ' ', result).strip()
        result = re.sub(r'\s+([,:.])', r'\1', result)
        if result and not result.endswith('.'):
            result += '.'
        return result

    def _insert_missing_placeholder(self, text: str, code: str, placeholder: str) -> str:
        """Insert one placeholder for a specific missing-field code."""
        working = text.strip()

        if code == "reference_missing_author":
            if re.match(r'^\s*\[[A-Za-z][A-Za-z ]* missing\]', working, flags=re.IGNORECASE):
                return working
            return f"{placeholder}. {working}".strip()

        if code == "reference_missing_title":
            first_sentence = re.match(r'^\s*([^\.]+\.)(?:\s*(.*))?$', working)
            if first_sentence:
                head = first_sentence.group(1).strip()
                tail = (first_sentence.group(2) or '').strip()
                if tail:
                    return f"{head} {placeholder}. {tail}".strip()
                return f"{head} {placeholder}.".strip()
            return f"{placeholder}. {working}".strip()

        if code == "reference_missing_journal":
            year_match = re.search(r'\b(?:19|20)\d{2}\b', working)
            if year_match:
                left = working[:year_match.start()].rstrip().rstrip('.')
                right = working[year_match.start():].lstrip()
                return f"{left}. {placeholder}. {right}".strip()
            return working.rstrip('. ') + f" {placeholder}."

        if code == "reference_missing_year":
            vol_match = re.search(r';\s*[A-Za-z]?\d+(?:\([^)]+\))?', working)
            if vol_match:
                return (working[:vol_match.start()] + f" {placeholder}" + working[vol_match.start():]).strip()
            return re.sub(
                r'(?i)\s*Available from:',
                f" {placeholder}. Available from:",
                working,
                count=1,
            ) if re.search(r'(?i)Available from:', working) else working.rstrip('. ') + f"; {placeholder}."

        if code == "reference_missing_volume":
            year_match = re.search(r'\b(?:19|20)\d{2}\b', working)
            if year_match:
                at = year_match.end()
                return (working[:at] + f";{placeholder}" + working[at:]).strip()
            return working.rstrip('. ') + f";{placeholder}."

        if code == "reference_missing_pages":
            vol_match = re.search(r';\s*[A-Za-z]?\d+(?:\([^)]+\))?', working)
            if vol_match:
                at = vol_match.end()
                return (working[:at] + f":{placeholder}" + working[at:]).strip()
            if re.search(r'(?i)\bIn:\s*', working):
                return working.rstrip('. ') + f" p. {placeholder}."
            return working.rstrip('. ') + f" {placeholder}."

        if code == "reference_missing_place":
            pub_year = re.search(
                r'(?P<lead>\s*)(?P<publisher>[^.;\[\]]+?)\s*;\s*(?P<year>(?:19|20)\d{2})',
                working,
                flags=re.IGNORECASE,
            )
            if pub_year:
                lead = ' ' if (pub_year.group('lead') or '') else ''
                publisher = (pub_year.group('publisher') or '').strip()
                year = (pub_year.group('year') or '').strip()
                replacement = f"{lead}{placeholder}: {publisher}; {year}"
                return (working[:pub_year.start()] + replacement + working[pub_year.end():]).strip()
            return working.rstrip('. ') + f" {placeholder}."

        if code == "reference_missing_publisher":
            place_year = re.search(
                r'(?P<lead>\s*)(?P<place>[^.;\[\]]+?)\s*;\s*(?P<year>(?:19|20)\d{2})',
                working,
                flags=re.IGNORECASE,
            )
            if place_year:
                lead = ' ' if (place_year.group('lead') or '') else ''
                place = (place_year.group('place') or '').strip()
                year = (place_year.group('year') or '').strip()
                replacement = f"{lead}{place}: {placeholder}; {year}"
                return (working[:place_year.start()] + replacement + working[place_year.end():]).strip()
            return working.rstrip('. ') + f" {placeholder}."

        if code == "reference_missing_editor":
            if re.search(r'(?i)\bIn:\s*', working):
                return re.sub(r'(?i)\bIn:\s*', f'In: {placeholder}, editor. ', working, count=1).strip()
            return working.rstrip('. ') + f" In: {placeholder}, editor."

        if code == "reference_missing_cited_date":
            if re.search(r'(?i)\[cited [^\]]+\]', working):
                return working
            if re.search(r'(?i)Available from:', working):
                dotted = re.sub(
                    r'(?i)\.\s*Available from:',
                    f' {placeholder}. Available from:',
                    working,
                    count=1,
                ).strip()
                if dotted != working:
                    return dotted
                return re.sub(
                    r'(?i)\s*Available from:',
                    f' {placeholder}. Available from:',
                    working,
                    count=1,
                ).strip()
            year_match = re.search(r'\b(?:19|20)\d{2}\b', working)
            if year_match:
                at = year_match.end()
                return (working[:at] + f" {placeholder}" + working[at:]).strip()
            return working.rstrip('. ') + f" {placeholder}."

        if code == "reference_missing_url":
            if re.search(r'(?i)(https?://\S+|www\.\S+)', working):
                return working
            if re.search(r'(?i)Available from:\s*$', working):
                return working + f" {placeholder}"
            if re.search(r'(?i)Available from:\s*', working):
                return re.sub(r'(?i)Available from:\s*', f'Available from: {placeholder} ', working, count=1).strip()
            return working.rstrip('. ') + f". Available from: {placeholder}."

        return working.rstrip('. ') + f" {placeholder}."

    def _extract_reference_entries(self, text: str) -> List[str]:
        """Extract normalized reference lines from references section."""
        lines = (text or "").split('\n')
        entries: List[str] = []
        in_references = False
        current_index = -1

        heading_re = re.compile(r'^\s*references?\s*:?\s*$', flags=re.IGNORECASE)
        leading_marker_re = re.compile(r'^\s*(?:\[\s*\d+\s*\]|\d+\s*[.)])\s*')
        section_break_re = re.compile(
            r'^\s*(?:appendix|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|author\s+contributions?)\s*:?\s*$',
            flags=re.IGNORECASE
        )
        continuation_re = re.compile(
            r'^(?:https?://|www\.|doi:\s*10\.|10\.\d{4,9}/|available\s+from|accessed\b|pmid\b|pmcid\b|epub\b)',
            flags=re.IGNORECASE
        )

        for line in lines:
            if heading_re.match(line):
                in_references = True
                current_index = -1
                continue

            if in_references and section_break_re.match(line):
                in_references = False
                current_index = -1
                continue

            if not in_references:
                continue

            stripped = line.strip()
            if not stripped:
                current_index = -1
                continue

            cleaned = leading_marker_re.sub('', stripped)
            is_continuation = (
                current_index >= 0 and
                (
                    line[:1].isspace() or
                    continuation_re.match(cleaned) is not None
                )
            )
            if is_continuation:
                entries[current_index] = entries[current_index].rstrip() + ' ' + cleaned
                continue

            entries.append(cleaned)
            current_index = len(entries) - 1

        return entries

    def build_reference_profile_report(self, text: str, options: Optional[Dict] = None) -> Dict[str, Any]:
        """Return profile details + profile-aware validation messages."""
        profile = self.resolve_journal_profile(options)
        entries = self._extract_reference_entries(text)
        issues: Dict[str, int] = {}

        def bump(code: str):
            issues[code] = int(issues.get(code, 0)) + 1

        for entry in entries:
            metadata = self._analyze_reference_entry(entry)
            authors = str(metadata.get("authors") or "")
            title = str(metadata.get("title") or "")
            journal = str(metadata.get("journal") or "")
            initials_with_periods = bool(profile.get("initials_with_periods"))
            if initials_with_periods:
                if re.search(r'\b[A-Z]{2,}\b', authors):
                    bump("initials_missing_periods")
            else:
                if re.search(r'\b[A-Z]\.', authors):
                    bump("initials_have_periods")

            title_mode = str(profile.get("title_case", "sentence")).strip().lower()
            alpha_words = re.findall(r"[A-Za-z][A-Za-z'’\-]*", title)
            if title_mode == "sentence" and len(alpha_words) >= 3:
                extra_caps = 0
                for word in alpha_words[1:]:
                    if (
                        word[:1].isupper() and
                        word.lower() not in self.TITLE_PROPER_WORDS and
                        word not in self.TITLE_ACRONYMS
                    ):
                        extra_caps += 1
                if extra_caps >= 2:
                    bump("title_not_sentence_case")
            if title_mode == "title" and len(alpha_words) >= 3:
                non_small_lower = 0
                for word in alpha_words[1:]:
                    if word.lower() in self.TITLE_SMALL_WORDS:
                        continue
                    if word.islower():
                        non_small_lower += 1
                if non_small_lower >= 2:
                    bump("title_not_title_case")

            if str(metadata.get("source_type") or "") == "journal":
                journal_mode = str(profile.get("journal_abbrev", "nlm")).strip().lower()
                if journal_mode == "nlm":
                    if re.search(r'\b(?:journal of|international|proceedings of)\b', journal, flags=re.IGNORECASE):
                        bump("journal_not_abbreviated")
                else:
                    if re.search(r'\b(?:J|Int|Archit|Res|Sci|Rev|Clin|Med|Technol|Environ|Assoc)\b', journal):
                        bump("journal_looks_abbreviated")

        message_map = {
            "initials_missing_periods": "author initials should use periods (A.B.)",
            "initials_have_periods": "author initials should omit periods (AB)",
            "title_not_sentence_case": "reference titles should be in sentence case",
            "title_not_title_case": "reference titles should be in title case",
            "journal_not_abbreviated": "journal names should use NLM-style abbreviations",
            "journal_looks_abbreviated": "journal names should be full (not abbreviated)",
        }
        ordered_codes = sorted(issues.keys(), key=lambda key: (-issues[key], key))
        validation_messages = [
            f"{issues[code]} reference(s): {message_map.get(code, code)}"
            for code in ordered_codes
        ]

        return {
            "profile_id": str(profile.get("id", "vancouver_periods")),
            "profile_label": str(profile.get("label", "Vancouver")),
            "rules": {
                "initials": "with periods (A.B.)" if bool(profile.get("initials_with_periods")) else "without periods (AB)",
                "title_case": str(profile.get("title_case", "sentence")),
                "journal_names": "NLM abbreviations" if str(profile.get("journal_abbrev", "nlm")) == "nlm" else "full journal names",
            },
            "reference_count": len(entries),
            "issue_counts": issues,
            "validation_messages": validation_messages[:8],
        }

    def _split_non_reference_and_reference_lines(self, text: str) -> Tuple[List[str], List[str]]:
        """Split manuscript lines into non-reference body and references section lines."""
        source_lines = (text or "").split('\n')
        body_lines: List[str] = []
        reference_lines: List[str] = []
        in_references = False

        heading_re = re.compile(r'^\s*references?\s*:?\s*$', flags=re.IGNORECASE)
        section_break_re = re.compile(
            r'^\s*(?:appendix|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|author\s+contributions?)\s*:?\s*$',
            flags=re.IGNORECASE
        )

        for line in source_lines:
            if heading_re.match(line):
                in_references = True
                reference_lines.append(line)
                continue
            if in_references and section_break_re.match(line):
                in_references = False
                body_lines.append(line)
                continue
            if in_references:
                reference_lines.append(line)
            else:
                body_lines.append(line)

        return body_lines, reference_lines

    def _extract_citation_numbers_in_order(self, text: str) -> List[int]:
        """Return unique citation numbers in the order they first appear in body text."""
        body_lines, _ = self._split_non_reference_and_reference_lines(text or "")
        ordered: List[int] = []
        seen = set()

        for line in body_lines:
            for match in re.finditer(r'\[(.*?)\]', line):
                content = (match.group(1) or "").strip()
                if not re.fullmatch(r'\d+(?:\s*,\s*\d+)*', content):
                    continue
                for part in content.split(','):
                    number = int(part.strip())
                    if number in seen:
                        continue
                    seen.add(number)
                    ordered.append(number)

        return ordered

    def _extract_reference_numbered_entries(self, text: str) -> List[Dict[str, Any]]:
        """Extract reference entries with optional explicit numeric index."""
        lines = (text or "").split('\n')
        entries: List[Dict[str, Any]] = []
        in_references = False
        current_index = -1
        auto_number = 1

        heading_re = re.compile(r'^\s*references?\s*:?\s*$', flags=re.IGNORECASE)
        leading_marker_re = re.compile(r'^\s*(?:\[\s*(\d+)\s*\]|(\d+)\s*[.)])\s*')
        section_break_re = re.compile(
            r'^\s*(?:appendix|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|author\s+contributions?)\s*:?\s*$',
            flags=re.IGNORECASE
        )
        continuation_re = re.compile(
            r'^(?:https?://|www\.|doi:\s*10\.|10\.\d{4,9}/|available\s+from|accessed\b|pmid\b|pmcid\b|epub\b)',
            flags=re.IGNORECASE
        )

        for line in lines:
            if heading_re.match(line):
                in_references = True
                current_index = -1
                auto_number = 1
                continue

            if in_references and section_break_re.match(line):
                in_references = False
                current_index = -1
                continue

            if not in_references:
                continue

            stripped = line.strip()
            if not stripped:
                current_index = -1
                continue

            marker_match = leading_marker_re.match(stripped)
            cleaned = leading_marker_re.sub('', stripped)
            marker_number: Optional[int] = None
            if marker_match:
                marker_number = int(marker_match.group(1) or marker_match.group(2))

            is_continuation = (
                current_index >= 0 and
                marker_match is None and
                (
                    line[:1].isspace() or
                    continuation_re.match(cleaned) is not None
                )
            )
            if is_continuation:
                entries[current_index]["entry"] = entries[current_index]["entry"].rstrip() + ' ' + cleaned
                continue

            if marker_number is None:
                marker_number = auto_number
            auto_number = max(auto_number, marker_number + 1)

            entries.append({
                "number": marker_number,
                "entry": cleaned,
            })
            current_index = len(entries) - 1

        return entries

    def _build_vancouver_renumber_plan(self, text: str) -> Tuple[Dict[int, int], List[Dict[str, Any]]]:
        """Build first-appearance citation remap plus ordered reference entries."""
        extracted = self._extract_reference_numbered_entries(text or "")
        indexed_entries: List[Dict[str, Any]] = []
        entries_by_number: Dict[int, List[Dict[str, Any]]] = {}

        for idx, item in enumerate(extracted):
            entry = {
                "source_index": idx,
                "number": int(item.get("number") or 0),
                "entry": str(item.get("entry") or ""),
            }
            indexed_entries.append(entry)
            entries_by_number.setdefault(entry["number"], []).append(entry)

        ordered_entries: List[Dict[str, Any]] = []
        used_source_indexes = set()
        renumber_map: Dict[int, int] = {}

        for old_number in self._extract_citation_numbers_in_order(text or ""):
            for entry in entries_by_number.get(old_number, []):
                source_index = int(entry["source_index"])
                if source_index in used_source_indexes:
                    continue
                used_source_indexes.add(source_index)
                ordered_entries.append(entry)
                renumber_map[old_number] = len(ordered_entries)
                break

        for entry in indexed_entries:
            source_index = int(entry["source_index"])
            if source_index in used_source_indexes:
                continue
            used_source_indexes.add(source_index)
            ordered_entries.append(entry)
            old_number = int(entry["number"])
            if old_number not in renumber_map:
                renumber_map[old_number] = len(ordered_entries)

        return renumber_map, ordered_entries

    def _renumber_citation_blocks(self, text: str, renumber_map: Dict[int, int]) -> str:
        """Renumber numeric body citations with a first-appearance map."""
        if not renumber_map:
            return text

        def repl(match):
            content = (match.group(1) or "").strip()
            if not re.fullmatch(r'\d+(?:\s*,\s*\d+)*', content):
                return match.group(0)

            renumbered: List[str] = []
            for part in content.split(','):
                old_number = int(part.strip())
                renumbered.append(str(int(renumber_map.get(old_number, old_number))))
            return '[' + ', '.join(renumbered) + ']'

        return re.sub(r'\[(.*?)\]', repl, text)

    def build_citation_reference_validator_report(self, text: str, options: Optional[Dict] = None) -> Dict[str, Any]:
        """Validate citation/reference integrity with issue categories and counts."""
        body_lines, _ = self._split_non_reference_and_reference_lines(text or "")
        body_text = "\n".join(body_lines)
        ref_entries = self._extract_reference_numbered_entries(text or "")

        issue_counts: Dict[str, int] = {}
        details: Dict[str, Any] = {
            "citation_numbers_missing_references": [],
            "reference_numbers_uncited": [],
            "reference_missing_author_numbers": [],
            "reference_missing_title_numbers": [],
            "reference_missing_journal_numbers": [],
            "reference_missing_year_numbers": [],
            "reference_missing_volume_numbers": [],
            "reference_missing_pages_numbers": [],
            "reference_missing_place_numbers": [],
            "reference_missing_publisher_numbers": [],
            "reference_missing_editor_numbers": [],
            "reference_missing_cited_date_numbers": [],
            "reference_missing_url_numbers": [],
        }

        def bump(code: str, amount: int = 1):
            issue_counts[code] = int(issue_counts.get(code, 0)) + int(amount)

        # Malformed bracket syntax checks.
        open_count = body_text.count('[')
        close_count = body_text.count(']')
        if open_count > close_count:
            bump("malformed_bracket_unclosed", open_count - close_count)
        elif close_count > open_count:
            bump("malformed_bracket_unopened", close_count - open_count)

        # Numeric citation block parsing.
        citation_block_count = 0
        cited_numbers: List[int] = []
        duplicate_within_block_count = 0
        malformed_citation_block_count = 0

        for line in body_lines:
            for match in re.finditer(r'\[(.*?)\]', line):
                content = (match.group(1) or "").strip()
                if not content:
                    malformed_citation_block_count += 1
                    continue

                citation_block_count += 1
                if not re.fullmatch(r'\d+(?:\s*,\s*\d+)*', content):
                    malformed_citation_block_count += 1
                    continue

                values = [int(part.strip()) for part in content.split(',') if part.strip()]
                seen: Set[int] = set()
                duplicated = False
                for value in values:
                    cited_numbers.append(value)
                    if value in seen:
                        duplicated = True
                    seen.add(value)
                if duplicated:
                    duplicate_within_block_count += 1

        if malformed_citation_block_count > 0:
            bump("malformed_citation_block", malformed_citation_block_count)
        if duplicate_within_block_count > 0:
            bump("duplicate_citation_numbers_in_block", duplicate_within_block_count)

        cited_set = set(cited_numbers)
        reference_numbers = {int(item["number"]) for item in ref_entries if isinstance(item.get("number"), int)}

        missing_refs = sorted(number for number in cited_set if number not in reference_numbers)
        if missing_refs:
            bump("citation_missing_reference", len(missing_refs))
            details["citation_numbers_missing_references"] = missing_refs

        uncited_refs = sorted(number for number in reference_numbers if number not in cited_set)
        if uncited_refs:
            bump("reference_not_cited_in_text", len(uncited_refs))
            details["reference_numbers_uncited"] = uncited_refs

        # Reference field completeness checks by source type.
        missing_by_code: Dict[str, List[int]] = {
            "reference_missing_author": [],
            "reference_missing_title": [],
            "reference_missing_journal": [],
            "reference_missing_year": [],
            "reference_missing_volume": [],
            "reference_missing_pages": [],
            "reference_missing_place": [],
            "reference_missing_publisher": [],
            "reference_missing_editor": [],
            "reference_missing_cited_date": [],
            "reference_missing_url": [],
        }
        detail_key_by_code = {
            "reference_missing_author": "reference_missing_author_numbers",
            "reference_missing_title": "reference_missing_title_numbers",
            "reference_missing_journal": "reference_missing_journal_numbers",
            "reference_missing_year": "reference_missing_year_numbers",
            "reference_missing_volume": "reference_missing_volume_numbers",
            "reference_missing_pages": "reference_missing_pages_numbers",
            "reference_missing_place": "reference_missing_place_numbers",
            "reference_missing_publisher": "reference_missing_publisher_numbers",
            "reference_missing_editor": "reference_missing_editor_numbers",
            "reference_missing_cited_date": "reference_missing_cited_date_numbers",
            "reference_missing_url": "reference_missing_url_numbers",
        }

        for item in ref_entries:
            number = int(item.get("number") or 0)
            entry = str(item.get("entry") or "")
            if not entry.strip():
                continue
            metadata = self._analyze_reference_entry(entry)
            for spec in self._reference_missing_specs(metadata):
                missing_by_code[str(spec["code"])].append(number)

        for code, numbers in missing_by_code.items():
            if numbers:
                bump(code, len(numbers))
                details[detail_key_by_code[code]] = numbers

        message_map = {
            "malformed_bracket_unclosed": "unclosed '[' bracket(s) in body text",
            "malformed_bracket_unopened": "unopened ']' bracket(s) in body text",
            "malformed_citation_block": "malformed in-text citation block(s) (expected [1] or [1, 2])",
            "duplicate_citation_numbers_in_block": "citation block(s) contain duplicate numbers (for example [2, 2])",
            "citation_missing_reference": "citation number(s) have no matching reference entry",
            "reference_not_cited_in_text": "reference entry number(s) are not cited in body text",
            "reference_missing_author": "reference entry/entries missing author or organization",
            "reference_missing_title": "reference entry/entries missing title",
            "reference_missing_journal": "journal article entry/entries missing journal name",
            "reference_missing_year": "reference entry/entries missing year pattern",
            "reference_missing_volume": "journal article entry/entries missing volume pattern",
            "reference_missing_pages": "reference entry/entries missing page range",
            "reference_missing_place": "book/website entry/entries missing place of publication",
            "reference_missing_publisher": "book/website entry/entries missing publisher",
            "reference_missing_editor": "chapter entry/entries missing editor",
            "reference_missing_cited_date": "website entry/entries missing cited date",
            "reference_missing_url": "website entry/entries missing URL",
        }
        ordered_codes = sorted(issue_counts.keys(), key=lambda key: (-issue_counts[key], key))
        messages = [
            f"{issue_counts[code]} issue(s): {message_map.get(code, code)}"
            for code in ordered_codes
        ]

        citation_issue_codes = {
            "malformed_bracket_unclosed",
            "malformed_bracket_unopened",
            "malformed_citation_block",
            "duplicate_citation_numbers_in_block",
            "citation_missing_reference",
            "reference_not_cited_in_text",
        }
        citation_issue_total = sum(count for code, count in issue_counts.items() if code in citation_issue_codes)
        reference_issue_total = sum(count for code, count in issue_counts.items() if code not in citation_issue_codes)
        online_validation = self._build_online_reference_validation_report(ref_entries, options or {})

        return {
            "summary": {
                "total_issues": sum(issue_counts.values()),
                "citation_issues": citation_issue_total,
                "reference_issues": reference_issue_total,
                "citation_blocks": citation_block_count,
                "unique_citations": len(cited_set),
                "references": len(ref_entries),
            },
            "category_counts": issue_counts,
            "messages": messages[:12],
            "details": details,
            "online_validation": online_validation,
        }

    def _build_online_reference_validation_report(
        self,
        ref_entries: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Validate journal references against public metadata services when enabled."""
        enabled = bool((options or {}).get("online_reference_validation", False))
        summary = {
            "checked": 0,
            "attempted": 0,
            "verified": 0,
            "likely_match": 0,
            "mismatch": 0,
            "not_found": 0,
            "ambiguous": 0,
            "skipped": 0,
            "error": 0,
        }
        report = {
            "enabled": enabled,
            "limit": self.ONLINE_VALIDATION_MAX_REFERENCES,
            "summary": summary,
            "entries": [],
            "messages": [],
        }
        if not enabled:
            report["messages"] = ["Online reference validation was disabled for this run."]
            return report

        checked = 0
        for item in ref_entries:
            if checked >= self.ONLINE_VALIDATION_MAX_REFERENCES:
                summary["skipped"] += 1
                continue

            number = int(item.get("number") or 0)
            entry = str(item.get("entry") or "").strip()
            if not entry:
                continue
            metadata = self._analyze_reference_entry(entry)
            if str(metadata.get("source_type") or "") != "journal":
                summary["skipped"] += 1
                report["entries"].append({
                    "number": number,
                    "status": "skipped",
                    "reason": "Online validation currently checks journal-style references only.",
                    "entry": entry,
                })
                continue
            if not metadata.get("has_title"):
                summary["skipped"] += 1
                report["entries"].append({
                    "number": number,
                    "status": "skipped",
                    "reason": "Reference title is missing, so no reliable online lookup was attempted.",
                    "entry": entry,
                })
                continue

            checked += 1
            result = self._validate_reference_online(number, entry, metadata)
            summary["checked"] += 1
            status = str(result.get("status") or "error")
            if status != "skipped":
                summary["attempted"] += 1
            summary[status] = int(summary.get(status, 0)) + 1
            report["entries"].append(result)

        if checked >= self.ONLINE_VALIDATION_MAX_REFERENCES and len(ref_entries) > self.ONLINE_VALIDATION_MAX_REFERENCES:
            report["messages"].append(
                f"Online validation checked the first {self.ONLINE_VALIDATION_MAX_REFERENCES} journal references to keep processing responsive."
            )
        if summary["error"] > 0:
            report["messages"].append("Some reference lookups failed due to remote API/network errors.")
        if summary["not_found"] > 0 or summary["mismatch"] > 0 or summary["ambiguous"] > 0:
            report["messages"].append("Review references marked not found, mismatch, or ambiguous before final submission.")
        if summary["attempted"] == 0:
            report["messages"].append("No eligible journal references were available for online validation.")
        return report

    def _validate_reference_online(self, number: int, entry: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Run conservative online validation for one journal reference."""
        base = {
            "number": number,
            "entry": entry,
            "doi": str(metadata.get("doi") or ""),
            "title": str(metadata.get("title") or ""),
            "year": str(metadata.get("year") or ""),
            "journal": str(metadata.get("journal") or ""),
            "status": "not_found",
            "reason": "No matching record was found online.",
            "source": "",
        }

        try:
            doi = str(metadata.get("doi") or "").strip().rstrip(".")
            if doi:
                match = self._fetch_crossref_work_by_doi(doi)
                if not match:
                    base["reason"] = "DOI did not resolve in Crossref."
                    return base
                assessed = self._assess_online_metadata_match(metadata, match, "crossref_doi")
                assessed.update({"number": number, "entry": entry, "doi": doi})
                return assessed

            candidates: List[Dict[str, Any]] = []
            candidates.extend(self._search_crossref_works(metadata))
            if not candidates:
                candidates.extend(self._search_openalex_works(metadata))
            if not candidates:
                return base

            scored = [self._assess_online_metadata_match(metadata, candidate, str(candidate.get("source") or "")) for candidate in candidates]
            scored.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
            best = scored[0]
            second_score = float(scored[1].get("score") or 0) if len(scored) > 1 else 0.0
            best_score = float(best.get("score") or 0)
            if best_score < 0.72:
                base["reason"] = "Search results did not closely match the supplied reference metadata."
                return base
            if second_score >= 0.78 and abs(best_score - second_score) <= 0.03:
                best["status"] = "ambiguous"
                best["reason"] = "Multiple similar online records matched this reference."
            elif best["status"] == "verified" and best_score < 0.93:
                best["status"] = "likely_match"
                best["reason"] = "A strong online match was found, but the citation was matched by search rather than DOI."
            best.update({"number": number, "entry": entry, "doi": str(metadata.get("doi") or "")})
            return best
        except requests.RequestException as exc:
            base["status"] = "error"
            base["reason"] = f"Online lookup failed: {exc.__class__.__name__}."
            return base
        except Exception as exc:
            base["status"] = "error"
            base["reason"] = f"Online validation error: {exc.__class__.__name__}."
            return base

    def _fetch_crossref_work_by_doi(self, doi: str) -> Optional[Dict[str, Any]]:
        """Return Crossref metadata for a DOI when available."""
        url = f"https://api.crossref.org/works/{quote(doi, safe='')}"
        response = requests.get(
            url,
            headers={"Accept": "application/json", "User-Agent": "manuscript-editor/1.0"},
            timeout=self.ONLINE_VALIDATION_TIMEOUT_SECONDS,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
        message = payload.get("message") if isinstance(payload, dict) else None
        return self._normalize_crossref_candidate(message) if isinstance(message, dict) else None

    def _search_crossref_works(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Search Crossref by bibliographic metadata."""
        title = str(metadata.get("title") or "").strip()
        first_author = self._extract_reference_first_author(str(metadata.get("authors") or ""))
        year = str(metadata.get("year") or "").strip()
        journal = str(metadata.get("journal") or "").strip()
        query = " ".join(part for part in [title, first_author, year, journal] if part).strip()
        if not query:
            return []
        response = requests.get(
            "https://api.crossref.org/works",
            headers={"Accept": "application/json", "User-Agent": "manuscript-editor/1.0"},
            params={"rows": 5, "query.bibliographic": query},
            timeout=self.ONLINE_VALIDATION_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        message = payload.get("message") if isinstance(payload, dict) else {}
        items = message.get("items") if isinstance(message, dict) else []
        normalized: List[Dict[str, Any]] = []
        for item in items if isinstance(items, list) else []:
            candidate = self._normalize_crossref_candidate(item)
            if candidate:
                normalized.append(candidate)
        return normalized

    def _search_openalex_works(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Fallback search in OpenAlex when Crossref does not find a title match."""
        title = str(metadata.get("title") or "").strip()
        if not title:
            return []
        response = requests.get(
            "https://api.openalex.org/works",
            headers={"Accept": "application/json", "User-Agent": "manuscript-editor/1.0"},
            params={"search": title, "per-page": 5},
            timeout=self.ONLINE_VALIDATION_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        results = payload.get("results") if isinstance(payload, dict) else []
        normalized: List[Dict[str, Any]] = []
        for item in results if isinstance(results, list) else []:
            candidate = self._normalize_openalex_candidate(item)
            if candidate:
                normalized.append(candidate)
        return normalized

    def _normalize_crossref_candidate(self, item: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Convert one Crossref record to internal matching metadata."""
        if not isinstance(item, dict):
            return None
        titles = item.get("title")
        title = titles[0] if isinstance(titles, list) and titles else str(item.get("title") or "")
        container = item.get("container-title")
        journal = container[0] if isinstance(container, list) and container else str(item.get("container-title") or "")
        issued = item.get("issued", {})
        year = ""
        if isinstance(issued, dict):
            date_parts = issued.get("date-parts")
            if isinstance(date_parts, list) and date_parts and isinstance(date_parts[0], list) and date_parts[0]:
                year = str(date_parts[0][0])
        authors = item.get("author")
        first_author = ""
        if isinstance(authors, list) and authors and isinstance(authors[0], dict):
            first_author = str(authors[0].get("family") or authors[0].get("name") or "").strip()
        pages = str(item.get("page") or "").strip()
        return {
            "source": "crossref",
            "title": str(title or "").strip(),
            "journal": str(journal or "").strip(),
            "year": year,
            "pages": pages,
            "volume": str(item.get("volume") or "").strip(),
            "issue": str(item.get("issue") or "").strip(),
            "doi": str(item.get("DOI") or "").strip(),
            "first_author": first_author,
        }

    def _normalize_openalex_candidate(self, item: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Convert one OpenAlex result to internal matching metadata."""
        if not isinstance(item, dict):
            return None
        location = item.get("primary_location") if isinstance(item.get("primary_location"), dict) else {}
        source = location.get("source") if isinstance(location.get("source"), dict) else {}
        authorships = item.get("authorships")
        first_author = ""
        if isinstance(authorships, list) and authorships and isinstance(authorships[0], dict):
            author = authorships[0].get("author") if isinstance(authorships[0].get("author"), dict) else {}
            first_author = str(author.get("display_name") or "").strip()
        biblio = item.get("biblio") if isinstance(item.get("biblio"), dict) else {}
        doi = str(item.get("doi") or "").strip()
        doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
        return {
            "source": "openalex",
            "title": str(item.get("display_name") or "").strip(),
            "journal": str(source.get("display_name") or "").strip(),
            "year": str(item.get("publication_year") or "").strip(),
            "pages": self._build_pages_value(str(biblio.get("first_page") or ""), str(biblio.get("last_page") or "")),
            "volume": str(biblio.get("volume") or "").strip(),
            "issue": str(biblio.get("issue") or "").strip(),
            "doi": doi.strip(),
            "first_author": first_author,
        }

    def _assess_online_metadata_match(
        self,
        metadata: Dict[str, Any],
        candidate: Dict[str, Any],
        source_label: str,
    ) -> Dict[str, Any]:
        """Score how well one remote metadata record matches the supplied reference."""
        title_score = self._text_similarity(str(metadata.get("title") or ""), str(candidate.get("title") or ""))
        reference_author = self._extract_reference_first_author(str(metadata.get("authors") or ""))
        candidate_author = self._extract_reference_first_author(str(candidate.get("first_author") or ""))
        author_match = bool(reference_author and candidate_author and reference_author == candidate_author)
        year_match = bool(metadata.get("year") and candidate.get("year") and str(metadata.get("year")) == str(candidate.get("year")))
        pages_match = self._page_tokens_match(str(metadata.get("pages") or ""), str(candidate.get("pages") or ""))
        score = title_score
        if author_match:
            score += 0.18
        if year_match:
            score += 0.12
        if pages_match:
            score += 0.08
        status = "verified"
        reason = "Online metadata matched the supplied reference."
        if title_score < 0.45 or (metadata.get("year") and candidate.get("year") and not year_match and not author_match):
            status = "mismatch"
            reason = "Online metadata conflicts with the supplied reference."
        elif score < 0.82:
            status = "likely_match"
            reason = "An online record closely matched the supplied reference."
        elif source_label == "crossref_doi" and metadata.get("doi") and candidate.get("doi") and str(metadata.get("doi")).lower() != str(candidate.get("doi")).lower():
            status = "mismatch"
            reason = "The DOI resolved, but the returned metadata did not match the supplied DOI."
        return {
            "status": status,
            "reason": reason,
            "source": source_label,
            "score": round(score, 3),
            "matched_title": str(candidate.get("title") or ""),
            "matched_journal": str(candidate.get("journal") or ""),
            "matched_year": str(candidate.get("year") or ""),
            "matched_pages": str(candidate.get("pages") or ""),
            "matched_doi": str(candidate.get("doi") or ""),
            "matched_first_author": str(candidate.get("first_author") or ""),
        }

    def _extract_reference_first_author(self, author_block: str) -> str:
        """Return a lowercased first-author family name for coarse matching."""
        text = re.sub(r'\bet al\.?$', '', str(author_block or '').strip(), flags=re.IGNORECASE).strip()
        if not text:
            return ""
        primary = re.split(r',|;|\band\b|&', text, maxsplit=1, flags=re.IGNORECASE)[0]
        tokens = re.findall(r"[A-Za-z][A-Za-z'`-]*", primary)
        if not tokens:
            return ""
        return tokens[0].lower()

    def _normalize_match_text(self, value: str) -> str:
        """Lowercase and strip punctuation for reference matching."""
        return " ".join(re.findall(r"[a-z0-9]+", str(value or "").lower()))

    def _text_similarity(self, left: str, right: str) -> float:
        """Return a small heuristic similarity score for metadata matching."""
        left_norm = self._normalize_match_text(left)
        right_norm = self._normalize_match_text(right)
        if not left_norm or not right_norm:
            return 0.0
        if left_norm == right_norm:
            return 1.0
        if left_norm in right_norm or right_norm in left_norm:
            return 0.92
        left_tokens = set(left_norm.split())
        right_tokens = set(right_norm.split())
        if not left_tokens or not right_tokens:
            return 0.0
        overlap = len(left_tokens & right_tokens)
        return (2.0 * overlap) / (len(left_tokens) + len(right_tokens))

    def _page_tokens_match(self, left: str, right: str) -> bool:
        """Compare page/article numbers loosely."""
        left_norm = re.sub(r'[^A-Za-z0-9]+', '', str(left or '').lower())
        right_norm = re.sub(r'[^A-Za-z0-9]+', '', str(right or '').lower())
        if not left_norm or not right_norm:
            return False
        return left_norm == right_norm

    def _build_pages_value(self, first_page: str, last_page: str) -> str:
        """Build a compact pages field from OpenAlex bibliographic fields."""
        first = str(first_page or "").strip()
        last = str(last_page or "").strip()
        if first and last and first != last:
            return f"{first}-{last}"
        return first or last

    def format_references_vancouver_numbered(self, text: str, options: Optional[Dict] = None) -> str:
        """Format manuscript citations/references in Vancouver first-appearance order."""
        profile = self.resolve_journal_profile(options or {})
        renumber_map, ordered_entries = self._build_vancouver_renumber_plan(text)

        lines = text.split('\n')
        output: List[str] = []
        in_references = False
        emitted_references = False

        heading_re = re.compile(r'^\s*references?\s*:?\s*$', flags=re.IGNORECASE)
        section_break_re = re.compile(
            r'^\s*(?:appendix|acknowledg(?:e)?ments?|funding|conflicts?\s+of\s+interest|author\s+contributions?)\s*:?\s*$',
            flags=re.IGNORECASE
        )

        for line in lines:
            if heading_re.match(line):
                in_references = True
                output.append("References")
                if not emitted_references:
                    for new_number, item in enumerate(ordered_entries, start=1):
                        normalized_entry = self._normalize_reference_entry(str(item.get("entry") or ""), profile)
                        output.append(f'[{new_number}] {normalized_entry or str(item.get("entry") or "").strip()}')
                    emitted_references = True
                continue

            if in_references and section_break_re.match(line):
                in_references = False
                output.append(line)
                continue

            if not in_references:
                output.append(self._renumber_citation_blocks(line, renumber_map))
                continue

            continue

        return '\n'.join(output)

    def _number_to_words(self, n: int) -> str:
        """Convert number to words (simplified for 1-100)."""
        ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
                'seventeen', 'eighteen', 'nineteen']
        tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

        if n < 20:
            return ones[n]
        elif n < 100:
            return tens[n // 10] + ('' if n % 10 == 0 else '-' + ones[n % 10])
        else:
            return 'one hundred'

    def get_corrections(self, original: str, corrected: str) -> List[Dict]:
        """Get list of corrections between original and corrected text."""
        corrections = []

        # Simple word-by-word diff
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

        # Handle length differences
        if len(orig_words) != len(corr_words):
            corrections.append({
                'position': min(len(orig_words), len(corr_words)),
                'original': ' '.join(orig_words[min(len(orig_words), len(corr_words)):]),
                'corrected': ' '.join(corr_words[min(len(orig_words), len(corr_words)):]),
                'type': 'length_change'
            })

        return corrections

    def get_domain_report(self) -> Dict:
        """Return last domain-detection/protection summary."""
        return {
            "profile": self.last_domain_profile,
            "scores": dict(self.last_domain_scores),
            "protected_terms": int(self.last_protected_domain_terms),
            "custom_terms": int(self.last_custom_terms_count),
        }

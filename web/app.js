let currentTab = 'original';
let currentViewMode = 'rich';
let fileContent = {
    original: '',
    fileName: '',
    corrected: '',
    fullCorrectedText: '',
    correctedAnnotatedHtml: '',
    redline: '',
    corrections: null,
    nounReport: null,
    domainReport: null,
    journalProfileReport: null,
    citationReferenceReport: null,
    groupDecisions: null,
    processingAudit: null
};
window.fileContent = fileContent;
const SETTINGS_STORAGE_KEY = 'manuscript_editor_ai_settings_v1';
const FIRST_RUN_SETUP_KEY = 'manuscript_editor_first_run_setup_v1';
const FIRST_RUN_SETUP_VERSION = '20260417r2';
const A4_WIDTH_PX = 8.27 * 96;
const A4_HEIGHT_PX = 11.69 * 96;
const DEFAULT_MODEL_BY_PROVIDER = {
    ollama: 'llama3.1',
    gemini: 'gemini-1.5-flash',
    openrouter: 'openrouter/auto',
    agent_router: 'openrouter/auto'
};
const AI_ADVANCED_DEFAULTS = {
    section_wise: true,
    section_threshold_chars: 12000,
    section_threshold_paragraphs: 90,
    section_chunk_chars: 5500,
    section_chunk_lines: 28,
    global_consistency_max_chars: 18000
};
const PAGE_PRESETS = {
    manuscript_default: {
        marginTopIn: 1,
        marginBottomIn: 1,
        marginLeftIn: 1.25,
        marginRightIn: 1.25,
        fontPt: 12,
        lineHeight: 1.5,
        paragraphSpacingPt: 0
    },
    journal_compact: {
        marginTopIn: 1,
        marginBottomIn: 1,
        marginLeftIn: 1,
        marginRightIn: 1,
        fontPt: 11,
        lineHeight: 1.35,
        paragraphSpacingPt: 3
    }
};
let pendingOllamaModelFromStorage = '';
let remoteOllamaHostHint = '';
let pageSettings = { ...PAGE_PRESETS.manuscript_default, preset: 'manuscript_default' };
const CORRECTION_GROUP_ORDER = ['spelling', 'capitalization', 'punctuation', 'citation', 'reference', 'style'];
const CORRECTION_GROUP_LABEL = {
    spelling: 'Spelling',
    capitalization: 'Capitalization',
    punctuation: 'Punctuation',
    citation: 'Citation',
    reference: 'Reference',
    style: 'Style'
};
let isApplyingGroupDecisions = false;
let pendingGroupDecisionApply = false;
const JOURNAL_PROFILE_VALUES = new Set([
    'vancouver_nlm',
    'vancouver_periods',
    'vancouver_full',
    'vancouver_periods_full',
    'vancouver_titlecase_nlm'
]);

// File handling
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const aiProvider = document.getElementById('ai-provider');
const ollamaModelSelect = document.getElementById('ollama-model-select');
const refreshModelsBtn = document.getElementById('refresh-models-btn');
const ollamaModelHint = document.getElementById('ollama-model-hint');
const ollamaModelSettings = document.getElementById('ollama-model-settings');
const geminiModelSettings = document.getElementById('gemini-model-settings');
const openrouterModelSettings = document.getElementById('openrouter-model-settings');
const agentRouterModelSettings = document.getElementById('agent-router-model-settings');
const geminiModelInput = document.getElementById('gemini-model-input');
const openrouterModelInput = document.getElementById('openrouter-model-input');
const agentRouterModelInput = document.getElementById('agent-router-model-input');
const ollamaSettings = document.getElementById('ollama-settings');
const geminiSettings = document.getElementById('gemini-settings');
const openrouterSettings = document.getElementById('openrouter-settings');
const aiEnabled = document.getElementById('opt-ai-enabled');
const ollamaHostInput = document.getElementById('ollama-host');
const useLocalOllamaBtn = document.getElementById('use-local-ollama-btn');
const useRemoteOllamaBtn = document.getElementById('use-remote-ollama-btn');
const geminiApiKeyInput = document.getElementById('gemini-api-key');
const openrouterApiKeyInput = document.getElementById('openrouter-api-key');
const aiSectionWiseInput = document.getElementById('ai-section-wise');
const aiSectionThresholdCharsInput = document.getElementById('ai-section-threshold-chars');
const aiSectionThresholdParagraphsInput = document.getElementById('ai-section-threshold-paragraphs');
const aiSectionChunkCharsInput = document.getElementById('ai-section-chunk-chars');
const aiSectionChunkLinesInput = document.getElementById('ai-section-chunk-lines');
const aiGlobalConsistencyMaxCharsInput = document.getElementById('ai-global-consistency-max-chars');
const domainProfileSelect = document.getElementById('domain-profile');
const customTermsInput = document.getElementById('custom-terms-input');
const importCustomTermsBtn = document.getElementById('import-custom-terms-btn');
const clearCustomTermsBtn = document.getElementById('clear-custom-terms-btn');
const customTermsFileInput = document.getElementById('custom-terms-file-input');
const referenceProfileSelect = document.getElementById('reference-profile');
const pageControls = document.getElementById('page-controls');
const pagePresetSelect = document.getElementById('page-preset');
const pageFontSizeInput = document.getElementById('page-font-size');
const pageLineHeightInput = document.getElementById('page-line-height');
const pageParagraphSpacingInput = document.getElementById('page-paragraph-spacing');
const pageMarginTopInput = document.getElementById('page-margin-top');
const pageMarginBottomInput = document.getElementById('page-margin-bottom');
const pageMarginLeftInput = document.getElementById('page-margin-left');
const pageMarginRightInput = document.getElementById('page-margin-right');
const openSetupWizardBtn = document.getElementById('open-setup-wizard-btn');
const setupWizardBackdrop = document.getElementById('setup-wizard-backdrop');
const setupWizardProvider = document.getElementById('wizard-provider');
const setupWizardOllamaBox = document.getElementById('wizard-ollama-box');
const setupWizardGeminiBox = document.getElementById('wizard-gemini-box');
const setupWizardOpenrouterBox = document.getElementById('wizard-openrouter-box');
const setupWizardOllamaHostInput = document.getElementById('wizard-ollama-host');
const setupWizardGeminiKeyInput = document.getElementById('wizard-gemini-key');
const setupWizardOpenrouterKeyInput = document.getElementById('wizard-openrouter-key');
const setupWizardHelp = document.getElementById('setup-wizard-help');
const setupWizardSaveBtn = document.getElementById('setup-wizard-save-btn');
const setupWizardCancelBtn = document.getElementById('setup-wizard-cancel-btn');
const setupWizardSkipBtn = document.getElementById('setup-wizard-skip-btn');

function escapeHtml(value) {
    return (value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function stripHtml(value) {
    return (value || '').replace(/<[^>]*>/g, '');
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

function clampInt(value, min, max, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

function parseCustomTerms(raw) {
    const source = String(raw || '');
    const chunks = source
        .split(/[\n,;]+/g)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2 && term.length <= 80);

    const seen = new Set();
    const terms = [];
    for (const term of chunks) {
        const key = term.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        terms.push(term);
        if (terms.length >= 500) {
            break;
        }
    }
    return terms;
}

function normalizeCustomTermsText(raw) {
    return parseCustomTerms(raw).join('\n');
}

function normalizeJournalProfile(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (JOURNAL_PROFILE_VALUES.has(value)) {
        return value;
    }
    return 'vancouver_nlm';
}

function buildDefaultGroupDecisions() {
    const decisions = {};
    CORRECTION_GROUP_ORDER.forEach((key) => {
        decisions[key] = true;
    });
    return decisions;
}

function normalizeGroupDecisions(raw) {
    const base = buildDefaultGroupDecisions();
    if (!raw || typeof raw !== 'object') {
        return base;
    }
    CORRECTION_GROUP_ORDER.forEach((key) => {
        if (!(key in raw)) {
            return;
        }
        const value = raw[key];
        if (typeof value === 'boolean') {
            base[key] = value;
            return;
        }
        if (typeof value === 'number') {
            base[key] = value !== 0;
            return;
        }
        const text = String(value || '').trim().toLowerCase();
        if (['1', 'true', 'yes', 'accept', 'accepted', 'on'].includes(text)) {
            base[key] = true;
        } else if (['0', 'false', 'no', 'reject', 'rejected', 'off'].includes(text)) {
            base[key] = false;
        }
    });
    return base;
}

function sanitizeAiAdvancedSettings(settings) {
    const base = settings || {};
    return {
        section_wise: base.section_wise !== false,
        section_threshold_chars: clampInt(base.section_threshold_chars, 4000, 120000, AI_ADVANCED_DEFAULTS.section_threshold_chars),
        section_threshold_paragraphs: clampInt(base.section_threshold_paragraphs, 20, 1000, AI_ADVANCED_DEFAULTS.section_threshold_paragraphs),
        section_chunk_chars: clampInt(base.section_chunk_chars, 1800, 30000, AI_ADVANCED_DEFAULTS.section_chunk_chars),
        section_chunk_lines: clampInt(base.section_chunk_lines, 8, 200, AI_ADVANCED_DEFAULTS.section_chunk_lines),
        global_consistency_max_chars: clampInt(base.global_consistency_max_chars, 6000, 120000, AI_ADVANCED_DEFAULTS.global_consistency_max_chars)
    };
}

function readAiAdvancedSettingsFromInputs() {
    return sanitizeAiAdvancedSettings({
        section_wise: aiSectionWiseInput.checked,
        section_threshold_chars: aiSectionThresholdCharsInput.value,
        section_threshold_paragraphs: aiSectionThresholdParagraphsInput.value,
        section_chunk_chars: aiSectionChunkCharsInput.value,
        section_chunk_lines: aiSectionChunkLinesInput.value,
        global_consistency_max_chars: aiGlobalConsistencyMaxCharsInput.value
    });
}

function applyAiAdvancedSettingsToInputs(settings) {
    const safe = sanitizeAiAdvancedSettings(settings);
    aiSectionWiseInput.checked = safe.section_wise;
    aiSectionThresholdCharsInput.value = safe.section_threshold_chars;
    aiSectionThresholdParagraphsInput.value = safe.section_threshold_paragraphs;
    aiSectionChunkCharsInput.value = safe.section_chunk_chars;
    aiSectionChunkLinesInput.value = safe.section_chunk_lines;
    aiGlobalConsistencyMaxCharsInput.value = safe.global_consistency_max_chars;
}

function ptToPx(pt) {
    return pt * (96 / 72);
}

function inToPx(inches) {
    return inches * 96;
}

function sanitizePageSettings(settings) {
    const base = settings || {};
    const fallback = PAGE_PRESETS.manuscript_default;
    return {
        preset: base.preset || 'custom',
        marginTopIn: clampNumber(base.marginTopIn, 0.5, 2.5, fallback.marginTopIn),
        marginBottomIn: clampNumber(base.marginBottomIn, 0.5, 2.5, fallback.marginBottomIn),
        marginLeftIn: clampNumber(base.marginLeftIn, 0.5, 2.5, fallback.marginLeftIn),
        marginRightIn: clampNumber(base.marginRightIn, 0.5, 2.5, fallback.marginRightIn),
        fontPt: clampNumber(base.fontPt, 9, 16, fallback.fontPt),
        lineHeight: clampNumber(base.lineHeight, 1.1, 2.2, fallback.lineHeight),
        paragraphSpacingPt: clampNumber(base.paragraphSpacingPt, 0, 20, fallback.paragraphSpacingPt)
    };
}

function applyPageSettingsToInputs(settings) {
    pagePresetSelect.value = settings.preset || 'custom';
    pageFontSizeInput.value = settings.fontPt;
    pageLineHeightInput.value = settings.lineHeight;
    pageParagraphSpacingInput.value = settings.paragraphSpacingPt;
    pageMarginTopInput.value = settings.marginTopIn;
    pageMarginBottomInput.value = settings.marginBottomIn;
    pageMarginLeftInput.value = settings.marginLeftIn;
    pageMarginRightInput.value = settings.marginRightIn;
}

function readPageSettingsFromInputs() {
    return sanitizePageSettings({
        preset: pagePresetSelect.value || 'custom',
        fontPt: pageFontSizeInput.value,
        lineHeight: pageLineHeightInput.value,
        paragraphSpacingPt: pageParagraphSpacingInput.value,
        marginTopIn: pageMarginTopInput.value,
        marginBottomIn: pageMarginBottomInput.value,
        marginLeftIn: pageMarginLeftInput.value,
        marginRightIn: pageMarginRightInput.value
    });
}

function applyPageStyleVariables() {
    const preview = document.getElementById('preview-text');
    const fontSizePx = ptToPx(pageSettings.fontPt);
    const paraSpacingPx = ptToPx(pageSettings.paragraphSpacingPt);
    const h2Px = fontSizePx * 1.25;
    const h3Px = fontSizePx * 1.05;

    preview.style.setProperty('--page-width-px', `${A4_WIDTH_PX.toFixed(1)}px`);
    preview.style.setProperty('--page-height-px', `${A4_HEIGHT_PX.toFixed(1)}px`);
    preview.style.setProperty('--page-margin-top-px', `${inToPx(pageSettings.marginTopIn).toFixed(1)}px`);
    preview.style.setProperty('--page-margin-bottom-px', `${inToPx(pageSettings.marginBottomIn).toFixed(1)}px`);
    preview.style.setProperty('--page-margin-left-px', `${inToPx(pageSettings.marginLeftIn).toFixed(1)}px`);
    preview.style.setProperty('--page-margin-right-px', `${inToPx(pageSettings.marginRightIn).toFixed(1)}px`);
    preview.style.setProperty('--page-font-size-px', `${fontSizePx.toFixed(2)}px`);
    preview.style.setProperty('--page-line-height', String(pageSettings.lineHeight));
    preview.style.setProperty('--page-para-spacing-px', `${paraSpacingPx.toFixed(2)}px`);
    preview.style.setProperty('--page-h2-size-px', `${h2Px.toFixed(2)}px`);
    preview.style.setProperty('--page-h3-size-px', `${h3Px.toFixed(2)}px`);
}

function setPagePreset(presetName) {
    const preset = PAGE_PRESETS[presetName];
    if (!preset) {
        return;
    }
    pageSettings = sanitizePageSettings({ ...preset, preset: presetName });
    applyPageSettingsToInputs(pageSettings);
    applyPageStyleVariables();
}

function onPageSettingsEdited() {
    pageSettings = readPageSettingsFromInputs();
    if (pageSettings.preset !== 'custom') {
        pageSettings.preset = 'custom';
        pagePresetSelect.value = 'custom';
    }
    applyPageStyleVariables();
    saveAiSettings();
    if (currentViewMode === 'page') {
        renderCurrentPreview();
    }
}

function isSectionHeading(text) {
    const normalized = text.trim();
    if (!normalized) {
        return false;
    }
    if (/^(abstract|introduction|methodology|methods|results|discussion|conclusion|references|keywords?)$/i.test(normalized)) {
        return true;
    }
    if (/^[A-Z][A-Za-z0-9,&:()'’\-./ ]+$/.test(normalized) && normalized.length < 110 && !/[.!?]$/.test(normalized)) {
        return true;
    }
    return false;
}

function renderRichDocument(content, isHtmlInput) {
    const normalized = (content || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    let html = '<div class="doc-preview">';
    let activeList = null; // bullet | numbered | reference
    let sawFirstHeading = false;

    function closeList() {
        if (!activeList) {
            return;
        }
        html += activeList === 'bullet' ? '</ul>' : '</ol>';
        activeList = null;
    }

    function openList(type) {
        if (activeList === type) {
            return;
        }
        closeList();
        if (type === 'bullet') {
            html += '<ul class="doc-list">';
        } else if (type === 'reference') {
            html += '<ol class="doc-list doc-list-ref">';
        } else {
            html += '<ol class="doc-list">';
        }
        activeList = type;
    }

    function toBodyFromLine(rawLine, plainLine, markerRegex) {
        if (!isHtmlInput) {
            return escapeHtml(plainLine.replace(markerRegex, '').trim());
        }
        return rawLine.replace(markerRegex, '').trim();
    }

    for (const line of lines) {
        const rawLine = isHtmlInput ? line : escapeHtml(line);
        const plainLine = (isHtmlInput ? stripHtml(line) : line).trim();

        if (!plainLine) {
            closeList();
            html += '<div class="doc-gap"></div>';
            continue;
        }

        const referenceMatch = plainLine.match(/^\[(\d+)\]\s+(.+)/);
        if (referenceMatch) {
            openList('reference');
            const value = parseInt(referenceMatch[1], 10);
            const body = toBodyFromLine(rawLine, plainLine, /^\[\d+\]\s+/);
            html += `<li value="${value}">${body}</li>`;
            continue;
        }

        const numberedMatch = plainLine.match(/^(\d+)[.)]\s+(.+)/);
        if (numberedMatch) {
            openList('numbered');
            const value = parseInt(numberedMatch[1], 10);
            const body = toBodyFromLine(rawLine, plainLine, /^\d+[.)]\s+/);
            html += `<li value="${value}">${body}</li>`;
            continue;
        }

        const bulletMatch = plainLine.match(/^[-*•]\s+(.+)/);
        if (bulletMatch) {
            openList('bullet');
            const body = toBodyFromLine(rawLine, plainLine, /^[-*•]\s+/);
            html += `<li>${body}</li>`;
            continue;
        }

        closeList();
        if (isSectionHeading(plainLine)) {
            const tag = sawFirstHeading ? 'h3' : 'h2';
            html += `<${tag}>${rawLine}</${tag}>`;
            sawFirstHeading = true;
        } else {
            html += `<p>${rawLine}</p>`;
        }
    }

    closeList();
    html += '</div>';
    return html;
}

function renderPageDocument(content, isHtmlInput) {
    const normalized = (content || '').replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const blocks = [];
    let sawFirstHeading = false;

    function lineBody(rawLine, plainLine, markerRegex) {
        if (!isHtmlInput) {
            return escapeHtml(plainLine.replace(markerRegex, '').trim());
        }
        return rawLine.replace(markerRegex, '').trim();
    }

    for (const line of lines) {
        const rawLine = isHtmlInput ? line : escapeHtml(line);
        const plainLine = (isHtmlInput ? stripHtml(line) : line).trim();

        if (!plainLine) {
            blocks.push({ kind: 'gap', plain: '' });
            continue;
        }

        const referenceMatch = plainLine.match(/^\[(\d+)\]\s+(.+)/);
        if (referenceMatch) {
            blocks.push({
                kind: 'ref',
                plain: referenceMatch[2],
                marker: `[${referenceMatch[1]}]`,
                html: lineBody(rawLine, plainLine, /^\[\d+\]\s+/)
            });
            continue;
        }

        const numberedMatch = plainLine.match(/^(\d+)[.)]\s+(.+)/);
        if (numberedMatch) {
            blocks.push({
                kind: 'numbered',
                plain: numberedMatch[2],
                marker: `${numberedMatch[1]}.`,
                html: lineBody(rawLine, plainLine, /^\d+[.)]\s+/)
            });
            continue;
        }

        const bulletMatch = plainLine.match(/^[-*•]\s+(.+)/);
        if (bulletMatch) {
            blocks.push({
                kind: 'bullet',
                plain: bulletMatch[1],
                marker: '•',
                html: lineBody(rawLine, plainLine, /^[-*•]\s+/)
            });
            continue;
        }

        if (isSectionHeading(plainLine)) {
            const headingLevel = sawFirstHeading ? 'h3' : 'h2';
            sawFirstHeading = true;
            blocks.push({ kind: headingLevel, plain: plainLine, html: rawLine });
            continue;
        }

        blocks.push({ kind: 'p', plain: plainLine, html: rawLine });
    }

    const fontSizePx = ptToPx(pageSettings.fontPt);
    const lineHeightValue = pageSettings.lineHeight;
    const linePx = fontSizePx * lineHeightValue;
    const paraSpacingPx = ptToPx(pageSettings.paragraphSpacingPt);
    const contentWidthPx =
        A4_WIDTH_PX - inToPx(pageSettings.marginLeftIn) - inToPx(pageSettings.marginRightIn);
    const charsPerLine = Math.max(34, Math.floor(contentWidthPx / Math.max(5.5, fontSizePx * 0.52)));
    const h2LinePx = fontSizePx * 1.25 * 1.22;
    const h3LinePx = fontSizePx * 1.05 * 1.18;

    function estimateBlockHeight(block) {
        const textLen = (block.plain || '').length;
        const estimatedLines = Math.max(1, Math.ceil(textLen / charsPerLine));
        if (block.kind === 'h2') {
            return 10 + estimatedLines * h2LinePx;
        }
        if (block.kind === 'h3') {
            return 8 + estimatedLines * h3LinePx;
        }
        if (block.kind === 'gap') {
            return Math.max(8, linePx * 0.5);
        }
        if (block.kind === 'bullet' || block.kind === 'numbered' || block.kind === 'ref') {
            return estimatedLines * linePx + paraSpacingPx;
        }
        return estimatedLines * linePx + paraSpacingPx;
    }

    function blockToHtml(block) {
        if (block.kind === 'gap') {
            return '<div class="doc-gap"></div>';
        }
        if (block.kind === 'h2') {
            return `<h2>${block.html}</h2>`;
        }
        if (block.kind === 'h3') {
            return `<h3>${block.html}</h3>`;
        }
        if (block.kind === 'bullet' || block.kind === 'numbered' || block.kind === 'ref') {
            return `<p class="page-list-item"><span class="page-list-marker">${block.marker}</span>${block.html}</p>`;
        }
        return `<p>${block.html}</p>`;
    }

    const maxPageHeight = Math.max(
        320,
        A4_HEIGHT_PX - inToPx(pageSettings.marginTopIn) - inToPx(pageSettings.marginBottomIn) - 40
    );
    const pages = [];
    let current = [];
    let currentHeight = 0;

    for (const block of blocks) {
        const h = estimateBlockHeight(block);
        if (current.length > 0 && currentHeight + h > maxPageHeight) {
            pages.push(current);
            current = [];
            currentHeight = 0;
        }
        current.push(block);
        currentHeight += h;
    }
    if (current.length > 0 || pages.length === 0) {
        pages.push(current);
    }

    let html = '<div class="page-stack">';
    pages.forEach((pageBlocks, index) => {
        html += '<article class="page-sheet">';
        for (const block of pageBlocks) {
            html += blockToHtml(block);
        }
        html += `<div class="page-number">Page ${index + 1}</div>`;
        html += '</article>';
    });
    html += '</div>';
    return html;
}

function renderCorrectionsPanel(report, nounReport, domainReport, journalProfileReport, citationReferenceReport, processingAudit, groupDecisions) {
    const safeReport = report && typeof report === 'object' ? report : null;
    if (!safeReport) {
        return '<div class="corrections-panel"><p class="cor-empty">No correction report available yet. Process a document first.</p></div>';
    }

    const counts = safeReport.counts && typeof safeReport.counts === 'object' ? safeReport.counts : {};
    const groups = safeReport.groups && typeof safeReport.groups === 'object' ? safeReport.groups : {};
    const total = Number(safeReport.total || 0);

    let html = '<div class="corrections-panel">';
    html += `<div class="cor-summary">Total detected changes: <strong>${total}</strong></div>`;
    const safeDecisions = normalizeGroupDecisions(groupDecisions);
    html += '<section class="decision-card">';
    html += '<div class="decision-title">Change Controls (Accept/Reject by Group)</div>';
    html += '<div class="decision-actions">';
    html += '<button class="decision-btn" onclick="applyAllGroupDecisions(true)">Accept All Groups</button>';
    html += '<button class="decision-btn decision-btn-reject" onclick="applyAllGroupDecisions(false)">Reject All Groups</button>';
    html += '</div>';
    html += '<div class="decision-grid">';
    CORRECTION_GROUP_ORDER.forEach((groupKey) => {
        const label = CORRECTION_GROUP_LABEL[groupKey] || groupKey;
        const accepted = !!safeDecisions[groupKey];
        html += '<div class="decision-item">';
        html += `<div class="decision-label">${escapeHtml(label)}</div>`;
        html += '<div class="decision-toggle">';
        html += `<button class="decision-chip ${accepted ? 'active' : ''}" onclick="setGroupDecision('${groupKey}', true)">Accept</button>`;
        html += `<button class="decision-chip reject ${!accepted ? 'active' : ''}" onclick="setGroupDecision('${groupKey}', false)">Reject</button>`;
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';
    html += '</section>';

    const safeDomain = domainReport && typeof domainReport === 'object' ? domainReport : null;
    const domainProfile = safeDomain ? String(safeDomain.profile || 'general') : 'general';
    const protectedTerms = safeDomain ? Number(safeDomain.protected_terms || 0) : 0;
    html += `<div class="cor-summary">Domain dictionary: <strong>${escapeHtml(domainProfile)}</strong> | Protected terms: <strong>${protectedTerms}</strong></div>`;
    const customTermsCount = safeDomain ? Number(safeDomain.custom_terms || 0) : 0;
    if (customTermsCount > 0) {
        html += `<div class="cor-summary">Custom glossary terms: <strong>${customTermsCount}</strong></div>`;
    }
    const safeValidator = citationReferenceReport && typeof citationReferenceReport === 'object'
        ? citationReferenceReport
        : null;
    if (safeValidator) {
        const summary = safeValidator.summary && typeof safeValidator.summary === 'object'
            ? safeValidator.summary
            : {};
        const categoryCounts = safeValidator.category_counts && typeof safeValidator.category_counts === 'object'
            ? safeValidator.category_counts
            : {};
        const messages = Array.isArray(safeValidator.messages) ? safeValidator.messages : [];
        const totalIssues = Number(summary.total_issues || 0);
        const citationIssues = Number(summary.citation_issues || 0);
        const referenceIssues = Number(summary.reference_issues || 0);
        const citationBlocks = Number(summary.citation_blocks || 0);
        const uniqueCitations = Number(summary.unique_citations || 0);
        const references = Number(summary.references || 0);

        const sortedCategories = Object.entries(categoryCounts)
            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
            .slice(0, 8);
        const humanizeCategory = (value) => String(value || '')
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

        html += '<section class="validator-card">';
        html += '<div class="validator-title">Citation & Reference Validator</div>';
        html += '<div class="validator-grid">';
        html += `<div class="validator-item"><span>Total Issues</span><strong>${totalIssues}</strong></div>`;
        html += `<div class="validator-item"><span>Citation Issues</span><strong>${citationIssues}</strong></div>`;
        html += `<div class="validator-item"><span>Reference Issues</span><strong>${referenceIssues}</strong></div>`;
        html += `<div class="validator-item"><span>Citation Blocks</span><strong>${citationBlocks}</strong></div>`;
        html += `<div class="validator-item"><span>Unique Citations</span><strong>${uniqueCitations}</strong></div>`;
        html += `<div class="validator-item"><span>References</span><strong>${references}</strong></div>`;
        html += '</div>';

        if (sortedCategories.length > 0) {
            html += '<div class="validator-categories">';
            sortedCategories.forEach(([code, count]) => {
                html += `<span class="validator-chip">${escapeHtml(humanizeCategory(code))}: ${Number(count || 0)}</span>`;
            });
            html += '</div>';
        }

        if (messages.length > 0) {
            html += '<div class="validator-messages">';
            html += '<div class="validator-messages-title">Warnings</div>';
            html += '<ul>';
            messages.forEach((message) => {
                html += `<li>${escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        } else {
            html += '<div class="validator-ok">No citation/reference validation issues detected.</div>';
        }
        html += '</section>';
    }
    const safeJournal = journalProfileReport && typeof journalProfileReport === 'object' ? journalProfileReport : null;
    if (safeJournal) {
        const profileLabel = String(safeJournal.profile_label || safeJournal.profile_id || 'Vancouver');
        const referenceCount = Number(safeJournal.reference_count || 0);
        const rules = safeJournal.rules && typeof safeJournal.rules === 'object' ? safeJournal.rules : {};
        const ruleInitials = String(rules.initials || 'without periods (AB)');
        const ruleTitleCase = String(rules.title_case || 'sentence');
        const ruleJournalNames = String(rules.journal_names || 'NLM abbreviations');
        const validationMessages = Array.isArray(safeJournal.validation_messages) ? safeJournal.validation_messages : [];

        html += '<section class="profile-card">';
        html += `<div class="profile-title">Journal Profile</div>`;
        html += `<div class="profile-summary">Profile: <strong>${escapeHtml(profileLabel)}</strong> | References detected: <strong>${referenceCount}</strong></div>`;
        html += '<div class="profile-rules">';
        html += `<span class="profile-chip">Initials: ${escapeHtml(ruleInitials)}</span>`;
        html += `<span class="profile-chip">Title case: ${escapeHtml(ruleTitleCase)}</span>`;
        html += `<span class="profile-chip">Journal names: ${escapeHtml(ruleJournalNames)}</span>`;
        html += '</div>';
        if (validationMessages.length > 0) {
            html += '<div class="profile-validation">';
            html += '<div class="profile-validation-title">Profile-aware validation</div>';
            html += '<ul>';
            validationMessages.forEach((message) => {
                html += `<li>${escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        } else {
            html += '<div class="profile-ok">No profile mismatches detected in references.</div>';
        }
        html += '</section>';
    }

    const safeAudit = processingAudit && typeof processingAudit === 'object' ? processingAudit : null;
    if (safeAudit && safeAudit.mode === 'sectioned') {
        const summary = safeAudit.summary && typeof safeAudit.summary === 'object' ? safeAudit.summary : {};
        const consistency = summary.consistency && typeof summary.consistency === 'object' ? summary.consistency : {};
        const fallbackReasons = summary.fallback_reason_counts && typeof summary.fallback_reason_counts === 'object'
            ? summary.fallback_reason_counts
            : {};
        const reasonItems = Object.entries(fallbackReasons).slice(0, 6);

        const fmt = (value, digits = 2, suffix = '') => {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return '—';
            }
            return `${n.toFixed(digits)}${suffix}`;
        };

        const humanizeReason = (value) => String(value || '')
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());

        const consistencyDecision = String(consistency.decision || 'skipped');
        const consistencyReason = String(consistency.reason || '');
        const consistencyDelta = Number(consistency.quality_delta);
        const consistencyDeltaText = Number.isFinite(consistencyDelta)
            ? (consistencyDelta > 0 ? `+${consistencyDelta}` : `${consistencyDelta}`)
            : '—';

        html += '<section class="audit-card">';
        html += '<div class="audit-title">AI Section Audit Summary</div>';
        html += '<div class="audit-grid">';
        html += `<div class="audit-item"><span>Sections</span><strong>${Number(summary.total_sections || 0)}</strong></div>`;
        html += `<div class="audit-item"><span>Accepted</span><strong>${Number(summary.accepted_sections || 0)}</strong></div>`;
        html += `<div class="audit-item"><span>Fallback</span><strong>${Number(summary.fallback_sections || 0)}</strong></div>`;
        html += `<div class="audit-item"><span>Acceptance Rate</span><strong>${fmt(summary.acceptance_rate, 2, '%')}</strong></div>`;
        html += `<div class="audit-item"><span>Avg Baseline Risk</span><strong>${fmt(summary.average_baseline_risk_score, 2)}</strong></div>`;
        html += `<div class="audit-item"><span>Avg AI Risk</span><strong>${fmt(summary.average_ai_risk_score, 2)}</strong></div>`;
        html += `<div class="audit-item"><span>Avg Baseline Quality</span><strong>${fmt(summary.average_baseline_quality, 2)}</strong></div>`;
        html += `<div class="audit-item"><span>Avg AI Quality</span><strong>${fmt(summary.average_ai_quality, 2)}</strong></div>`;
        html += '</div>';

        html += '<div class="audit-consistency">';
        html += `<div><span class="audit-label">Consistency Pass:</span> <strong>${escapeHtml(consistencyDecision)}</strong></div>`;
        html += `<div><span class="audit-label">Quality Delta:</span> <strong>${escapeHtml(consistencyDeltaText)}</strong></div>`;
        if (consistencyReason) {
            html += `<div class="audit-note">${escapeHtml(consistencyReason)}</div>`;
        }
        html += '</div>';

        if (reasonItems.length > 0) {
            html += '<div class="audit-reasons">';
            reasonItems.forEach(([reason, count]) => {
                html += `<span class="audit-chip">${escapeHtml(humanizeReason(reason))}: ${Number(count || 0)}</span>`;
            });
            html += '</div>';
        }

        html += '</section>';
    }

    const nouns = nounReport && typeof nounReport === 'object' ? nounReport : null;
    const properNouns = nouns && Array.isArray(nouns.proper_nouns) ? nouns.proper_nouns.slice(0, 12) : [];
    const commonNouns = nouns && Array.isArray(nouns.common_nouns) ? nouns.common_nouns.slice(0, 12) : [];
    const nounSource = nouns ? String(nouns.source || 'heuristic') : 'none';
    html += `<section class="cor-group">`;
    html += `<h3>Nouns <span>${escapeHtml(nounSource)}</span></h3>`;
    html += '<div class="noun-wrap">';
    html += '<div><div class="noun-label">Proper Nouns</div><div class="noun-chips">';
    if (properNouns.length === 0) {
        html += '<span class="noun-empty">None detected</span>';
    } else {
        properNouns.forEach((item) => {
            const word = escapeHtml(String(item.word || ''));
            const count = Number(item.count || 0);
            html += `<span class="noun-chip proper">${word}${count > 1 ? ` (${count})` : ''}</span>`;
        });
    }
    html += '</div></div>';
    html += '<div><div class="noun-label">Common Nouns</div><div class="noun-chips">';
    if (commonNouns.length === 0) {
        html += '<span class="noun-empty">None detected</span>';
    } else {
        commonNouns.forEach((item) => {
            const word = escapeHtml(String(item.word || ''));
            const count = Number(item.count || 0);
            html += `<span class="noun-chip common">${word}${count > 1 ? ` (${count})` : ''}</span>`;
        });
    }
    html += '</div></div>';
    html += '</div>';
    html += '</section>';

    const hasAny = CORRECTION_GROUP_ORDER.some((key) => (Array.isArray(groups[key]) && groups[key].length > 0));
    if (!hasAny) {
        html += '<p class="cor-empty">No differences detected between original and corrected text.</p>';
        html += '</div>';
        return html;
    }

    CORRECTION_GROUP_ORDER.forEach((groupKey) => {
        const items = Array.isArray(groups[groupKey]) ? groups[groupKey] : [];
        const count = Number(counts[groupKey] || items.length || 0);
        if (count <= 0 || items.length === 0) {
            return;
        }

        const label = CORRECTION_GROUP_LABEL[groupKey] || groupKey;
        html += `<section class="cor-group">`;
        html += `<h3>${escapeHtml(label)} <span>${count}</span></h3>`;
        html += '<ul>';

        items.forEach((item) => {
            const line = Number(item.line || 0);
            const oldText = (item.original || '').trim();
            const newText = (item.corrected || '').trim();
            const context = (item.context || '').trim();
            const oldDisplay = oldText ? escapeHtml(oldText) : '<em class="cor-empty-token">(none)</em>';
            const newDisplay = newText ? escapeHtml(newText) : '<em class="cor-empty-token">(none)</em>';

            html += '<li>';
            html += `<div class="cor-line">Line ${line > 0 ? line : '-'}</div>`;
            html += `<div class="cor-change"><span class="cor-old">${oldDisplay}</span><span class="cor-arrow">→</span><span class="cor-new">${newDisplay}</span></div>`;
            if (context) {
                html += `<div class="cor-context">${escapeHtml(context)}</div>`;
            }
            html += '</li>';
        });

        html += '</ul>';
        html += '</section>';
    });

    html += '</div>';
    return html;
}

function renderCurrentPreview() {
    const preview = document.getElementById('preview-text');
    if (currentTab === 'corrections') {
        preview.innerHTML = renderCorrectionsPanel(
            fileContent.corrections,
            fileContent.nounReport,
            fileContent.domainReport,
            fileContent.journalProfileReport,
            fileContent.citationReferenceReport,
            fileContent.processingAudit,
            fileContent.groupDecisions
        );
        return;
    }

    if (currentViewMode === 'compare') {
        const correctedHtml = fileContent.correctedAnnotatedHtml || '';
        const originalHtml = renderRichDocument(fileContent.original || '', false);
        const correctedViewHtml = correctedHtml
            ? renderRichDocument(correctedHtml, true)
            : renderRichDocument(fileContent.corrected || '', false);
        const redlineSource = fileContent.redline || fileContent.corrected || '';
        const redlineHtml = renderRichDocument(redlineSource, true);

        preview.innerHTML = [
            '<div class="compare-grid">',
            `<section class="compare-pane"><h3>Original</h3><div class="compare-content">${originalHtml}</div></section>`,
            `<section class="compare-pane"><h3>Corrected</h3><div class="compare-content">${correctedViewHtml}</div></section>`,
            `<section class="compare-pane"><h3>Redline</h3><div class="compare-content">${redlineHtml}</div></section>`,
            '</div>'
        ].join('');
        return;
    }

    const tabValue = currentTab === 'redline'
        ? (fileContent.redline || fileContent.corrected || '')
        : (currentTab === 'corrected' ? (fileContent.corrected || '') : (fileContent[currentTab] || ''));
    const correctedHtml = fileContent.correctedAnnotatedHtml || '';

    if (currentViewMode === 'plain') {
        if (currentTab === 'redline') {
            preview.textContent = stripHtml(tabValue);
        } else {
            preview.textContent = tabValue;
        }
        return;
    }

    if (currentViewMode === 'page') {
        if (currentTab === 'redline') {
            preview.innerHTML = renderPageDocument(tabValue, true);
            return;
        }
        if (currentTab === 'corrected' && correctedHtml) {
            preview.innerHTML = renderPageDocument(correctedHtml, true);
            return;
        }
        preview.innerHTML = renderPageDocument(tabValue, false);
        return;
    }

    if (currentTab === 'redline') {
        preview.innerHTML = renderRichDocument(tabValue, true);
        return;
    }

    if (currentTab === 'corrected' && correctedHtml) {
        preview.innerHTML = renderRichDocument(correctedHtml, true);
        return;
    }

    preview.innerHTML = renderRichDocument(tabValue, false);
}

function getCurrentAiModel() {
    if (aiProvider.value === 'ollama') {
        return (ollamaModelSelect.value || pendingOllamaModelFromStorage || DEFAULT_MODEL_BY_PROVIDER.ollama).trim();
    }
    if (aiProvider.value === 'openrouter') {
        return (openrouterModelInput.value || DEFAULT_MODEL_BY_PROVIDER.openrouter).trim();
    }
    if (aiProvider.value === 'agent_router') {
        return (agentRouterModelInput.value || DEFAULT_MODEL_BY_PROVIDER.agent_router).trim();
    }
    return (geminiModelInput.value || DEFAULT_MODEL_BY_PROVIDER.gemini).trim();
}

function isLocalOllamaHost(rawHost) {
    const value = (rawHost || '').trim().toLowerCase();
    if (!value) {
        return false;
    }
    return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(value);
}

function normalizeOllamaHost(rawHost) {
    let value = (rawHost || '').trim();
    if (!value) {
        return '';
    }
    if (!/^https?:\/\//i.test(value)) {
        value = `http://${value}`;
    }
    value = value.replace(/\/+$/, '');

    try {
        const url = new URL(value);
        const port = url.port || '11434';
        return `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
    } catch (err) {
        return '';
    }
}

function applyOllamaHost(host, statusMessage) {
    const normalized = normalizeOllamaHost(host);
    if (!normalized) {
        alert('Invalid host. Use an IP or URL like 192.168.1.25 or http://192.168.1.25:11434');
        return;
    }

    ollamaHostInput.value = normalized;
    aiProvider.value = 'ollama';
    if (!isLocalOllamaHost(normalized)) {
        remoteOllamaHostHint = normalized;
    }
    updateAiProviderUI();
    saveAiSettings();
    if (statusMessage) {
        setStatus(statusMessage, 'success');
    }
}

function setOllamaModelOptions(models, preferredModel) {
    ollamaModelSelect.innerHTML = '';

    if (!models || models.length === 0) {
        const fallbackModel = (preferredModel || DEFAULT_MODEL_BY_PROVIDER.ollama).trim();
        const option = document.createElement('option');
        option.value = fallbackModel;
        option.textContent = fallbackModel;
        ollamaModelSelect.appendChild(option);
        ollamaModelSelect.value = fallbackModel;
        ollamaModelSelect.disabled = true;
        return;
    }

    models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        ollamaModelSelect.appendChild(option);
    });
    ollamaModelSelect.disabled = false;

    if (preferredModel && models.includes(preferredModel)) {
        ollamaModelSelect.value = preferredModel;
    } else {
        ollamaModelSelect.value = models[0];
    }
}

function fetchOllamaModels(preferredModel) {
    if (typeof eel === 'undefined' || typeof eel.get_ollama_models !== 'function') {
        setOllamaModelOptions([], preferredModel || pendingOllamaModelFromStorage || DEFAULT_MODEL_BY_PROVIDER.ollama);
        ollamaModelHint.textContent = 'Could not detect models automatically. Using default.';
        saveAiSettings();
        return;
    }

    ollamaModelHint.textContent = 'Loading Ollama models...';
    const host = ollamaHostInput.value.trim();
    eel.get_ollama_models(host)(function(response) {
        if (response && response.success) {
            const models = Array.isArray(response.models) ? response.models : [];
            const targetModel =
                (preferredModel || pendingOllamaModelFromStorage || response.default_model || DEFAULT_MODEL_BY_PROVIDER.ollama).trim();
            setOllamaModelOptions(models, targetModel);

            if (models.length > 0) {
                ollamaModelHint.textContent = `Detected ${models.length} model(s).`;
            } else {
                ollamaModelHint.textContent = 'No Ollama models found. Run: ollama pull llama3.1';
            }
            pendingOllamaModelFromStorage = '';
            saveAiSettings();
            return;
        }

        setOllamaModelOptions([], preferredModel || pendingOllamaModelFromStorage || DEFAULT_MODEL_BY_PROVIDER.ollama);
        ollamaModelHint.textContent = 'Unable to fetch models from Ollama host.';
        pendingOllamaModelFromStorage = '';
        saveAiSettings();
    });
}

function saveAiSettings() {
    const normalizedHost = normalizeOllamaHost(ollamaHostInput.value) || ollamaHostInput.value.trim();
    const aiAdvanced = readAiAdvancedSettingsFromInputs();
    if (!isLocalOllamaHost(normalizedHost) && normalizedHost) {
        remoteOllamaHostHint = normalizedHost;
    }

    const payload = {
        enabled: aiEnabled.checked,
        provider: aiProvider.value,
        model: getCurrentAiModel(),
        ollama_model: (ollamaModelSelect.value || '').trim(),
        gemini_model: (geminiModelInput.value || '').trim(),
        openrouter_model: (openrouterModelInput.value || '').trim(),
        agent_router_model: (agentRouterModelInput.value || '').trim(),
        ollama_host: normalizedHost,
        remote_ollama_host: remoteOllamaHostHint,
        api_key: geminiApiKeyInput.value,
        gemini_api_key: geminiApiKeyInput.value,
        openrouter_api_key: openrouterApiKeyInput.value,
        ai_advanced: aiAdvanced,
        domain_profile: domainProfileSelect.value || 'auto',
        custom_terms_text: normalizeCustomTermsText(customTermsInput.value),
        journal_profile: normalizeJournalProfile(referenceProfileSelect.value),
        reference_profile: normalizeJournalProfile(referenceProfileSelect.value),
        page_settings: pageSettings
    };
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        // Ignore storage failures (private mode, quota limits, etc.)
    }
}

function loadAiSettings() {
    let stored = null;
    try {
        stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    } catch (err) {
        stored = null;
    }
    if (!stored) {
        return false;
    }

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch (err) {
        return false;
    }
    if (!parsed || typeof parsed !== 'object') {
        return false;
    }

    if (typeof parsed.enabled === 'boolean') {
        aiEnabled.checked = parsed.enabled;
    }
    if (parsed.provider === 'ollama' || parsed.provider === 'gemini' || parsed.provider === 'openrouter' || parsed.provider === 'agent_router') {
        aiProvider.value = parsed.provider;
    }
    const effectiveProvider = parsed.provider || aiProvider.value;
    if (effectiveProvider === 'ollama') {
        const candidate =
            (typeof parsed.ollama_model === 'string' && parsed.ollama_model.trim())
                ? parsed.ollama_model.trim()
                : ((typeof parsed.model === 'string' && parsed.model.trim()) ? parsed.model.trim() : DEFAULT_MODEL_BY_PROVIDER.ollama);
        pendingOllamaModelFromStorage = candidate === 'llama3.2' ? 'llama3.1' : candidate;
    }
    if (typeof parsed.gemini_model === 'string' && parsed.gemini_model.trim()) {
        geminiModelInput.value = parsed.gemini_model.trim();
    } else if (effectiveProvider === 'gemini' && typeof parsed.model === 'string' && parsed.model.trim()) {
        geminiModelInput.value = parsed.model.trim();
    }
    if (typeof parsed.openrouter_model === 'string' && parsed.openrouter_model.trim()) {
        openrouterModelInput.value = parsed.openrouter_model.trim();
    } else if (effectiveProvider === 'openrouter' && typeof parsed.model === 'string' && parsed.model.trim()) {
        openrouterModelInput.value = parsed.model.trim();
    }
    if (typeof parsed.agent_router_model === 'string' && parsed.agent_router_model.trim()) {
        agentRouterModelInput.value = parsed.agent_router_model.trim();
    } else if (effectiveProvider === 'agent_router' && typeof parsed.model === 'string' && parsed.model.trim()) {
        agentRouterModelInput.value = parsed.model.trim();
    }
    if (typeof parsed.ollama_host === 'string' && parsed.ollama_host.trim()) {
        ollamaHostInput.value = normalizeOllamaHost(parsed.ollama_host.trim()) || parsed.ollama_host.trim();
    }
    if (typeof parsed.remote_ollama_host === 'string' && parsed.remote_ollama_host.trim()) {
        remoteOllamaHostHint = normalizeOllamaHost(parsed.remote_ollama_host.trim()) || parsed.remote_ollama_host.trim();
    } else if (!isLocalOllamaHost(ollamaHostInput.value)) {
        remoteOllamaHostHint = normalizeOllamaHost(ollamaHostInput.value) || ollamaHostInput.value.trim();
    }
    if (typeof parsed.gemini_api_key === 'string') {
        geminiApiKeyInput.value = parsed.gemini_api_key;
    } else if (typeof parsed.api_key === 'string') {
        geminiApiKeyInput.value = parsed.api_key;
    }
    if (typeof parsed.openrouter_api_key === 'string') {
        openrouterApiKeyInput.value = parsed.openrouter_api_key;
    }
    if (parsed.ai_advanced && typeof parsed.ai_advanced === 'object') {
        applyAiAdvancedSettingsToInputs(parsed.ai_advanced);
    } else {
        applyAiAdvancedSettingsToInputs(AI_ADVANCED_DEFAULTS);
    }
    if (
        parsed.domain_profile === 'auto' ||
        parsed.domain_profile === 'general' ||
        parsed.domain_profile === 'medical' ||
        parsed.domain_profile === 'engineering' ||
        parsed.domain_profile === 'law'
    ) {
        domainProfileSelect.value = parsed.domain_profile;
    } else {
        domainProfileSelect.value = 'auto';
    }
    if (typeof parsed.custom_terms_text === 'string') {
        customTermsInput.value = normalizeCustomTermsText(parsed.custom_terms_text);
    }
    const selectedJournalProfile = normalizeJournalProfile(parsed.journal_profile || parsed.reference_profile || 'vancouver_nlm');
    referenceProfileSelect.value = selectedJournalProfile;
    if (parsed.page_settings && typeof parsed.page_settings === 'object') {
        pageSettings = sanitizePageSettings(parsed.page_settings);
        applyPageSettingsToInputs(pageSettings);
    } else {
        pageSettings = sanitizePageSettings({ ...PAGE_PRESETS.manuscript_default, preset: 'manuscript_default' });
        applyPageSettingsToInputs(pageSettings);
    }
    applyPageStyleVariables();
    return true;
}

function isSetupWizardComplete() {
    try {
        return localStorage.getItem(FIRST_RUN_SETUP_KEY) === FIRST_RUN_SETUP_VERSION;
    } catch (err) {
        return false;
    }
}

function markSetupWizardComplete() {
    try {
        localStorage.setItem(FIRST_RUN_SETUP_KEY, FIRST_RUN_SETUP_VERSION);
    } catch (err) {
        // Ignore storage failures.
    }
}

function updateSetupWizardProviderUI() {
    if (!setupWizardProvider) {
        return;
    }
    const provider = setupWizardProvider.value;
    setupWizardOllamaBox.classList.toggle('hidden', provider !== 'ollama');
    setupWizardGeminiBox.classList.toggle('hidden', provider !== 'gemini');
    setupWizardOpenrouterBox.classList.toggle('hidden', provider !== 'openrouter' && provider !== 'agent_router');

    if (provider === 'ollama') {
        setupWizardHelp.innerHTML = 'Use <strong>localhost</strong> for this PC. Use your LAN IP to connect to Ollama on another computer.';
    } else if (provider === 'gemini') {
        setupWizardHelp.innerHTML = 'Paste your Gemini key from Google AI Studio. Keep this key private.';
    } else if (provider === 'openrouter') {
        setupWizardHelp.innerHTML = 'Paste your OpenRouter API key. Model selection can be changed later in AI Settings.';
    } else {
        setupWizardHelp.innerHTML = 'Agent Router can use your OpenRouter key. You can tune routing/model later.';
    }
}

function syncSetupWizardFromCurrentSettings() {
    if (!setupWizardBackdrop) {
        return;
    }
    setupWizardProvider.value = aiProvider.value || 'ollama';
    setupWizardOllamaHostInput.value = normalizeOllamaHost(ollamaHostInput.value) || 'http://localhost:11434';
    setupWizardGeminiKeyInput.value = geminiApiKeyInput.value || '';
    setupWizardOpenrouterKeyInput.value = openrouterApiKeyInput.value || '';
    updateSetupWizardProviderUI();
}

function openSetupWizard() {
    if (!setupWizardBackdrop) {
        return;
    }
    syncSetupWizardFromCurrentSettings();
    setupWizardBackdrop.classList.remove('hidden');
}

function closeSetupWizard(markComplete) {
    if (!setupWizardBackdrop) {
        return;
    }
    setupWizardBackdrop.classList.add('hidden');
    if (markComplete) {
        markSetupWizardComplete();
    }
}

function saveSetupWizardSettings() {
    if (!setupWizardProvider) {
        return;
    }

    const provider = setupWizardProvider.value;
    if (provider === 'ollama') {
        const normalizedHost = normalizeOllamaHost(setupWizardOllamaHostInput.value);
        if (!normalizedHost) {
            alert('Please enter a valid Ollama host (example: http://localhost:11434)');
            return;
        }
        ollamaHostInput.value = normalizedHost;
        if (!isLocalOllamaHost(normalizedHost)) {
            remoteOllamaHostHint = normalizedHost;
        }
    }

    if (provider === 'gemini') {
        const geminiKey = (setupWizardGeminiKeyInput.value || '').trim();
        if (!geminiKey) {
            alert('Please paste a Gemini API key.');
            return;
        }
        geminiApiKeyInput.value = geminiKey;
    }
    if (provider === 'openrouter' || provider === 'agent_router') {
        const openrouterKey = (setupWizardOpenrouterKeyInput.value || '').trim();
        if (!openrouterKey) {
            alert('Please paste an OpenRouter API key.');
            return;
        }
        openrouterApiKeyInput.value = openrouterKey;
    }

    aiProvider.value = provider;
    aiEnabled.checked = true;
    updateAiProviderUI();
    saveAiSettings();
    closeSetupWizard(true);
    setStatus('Setup saved. You are ready to process documents.', 'success');
}

function maybeShowSetupWizardOnFirstRun() {
    if (!setupWizardBackdrop) {
        return;
    }
    if (isSetupWizardComplete()) {
        return;
    }
    openSetupWizard();
}

function updateAiProviderUI() {
    const provider = aiProvider.value;
    ollamaSettings.classList.toggle('hidden', provider !== 'ollama');
    geminiSettings.classList.toggle('hidden', provider !== 'gemini');
    openrouterSettings.classList.toggle('hidden', provider !== 'openrouter' && provider !== 'agent_router');
    ollamaModelSettings.classList.toggle('hidden', provider !== 'ollama');
    geminiModelSettings.classList.toggle('hidden', provider !== 'gemini');
    openrouterModelSettings.classList.toggle('hidden', provider !== 'openrouter');
    agentRouterModelSettings.classList.toggle('hidden', provider !== 'agent_router');

    if (provider === 'ollama') {
        const preferred = pendingOllamaModelFromStorage || ollamaModelSelect.value || DEFAULT_MODEL_BY_PROVIDER.ollama;
        fetchOllamaModels(preferred);
    } else if (provider === 'gemini' && !(geminiModelInput.value || '').trim()) {
        geminiModelInput.value = DEFAULT_MODEL_BY_PROVIDER.gemini;
    } else if (provider === 'openrouter' && !(openrouterModelInput.value || '').trim()) {
        openrouterModelInput.value = DEFAULT_MODEL_BY_PROVIDER.openrouter;
    } else if (provider === 'agent_router' && !(agentRouterModelInput.value || '').trim()) {
        agentRouterModelInput.value = DEFAULT_MODEL_BY_PROVIDER.agent_router;
    }
}

aiProvider.addEventListener('change', () => {
    updateAiProviderUI();
    saveAiSettings();
});
if (setupWizardProvider) {
    setupWizardProvider.addEventListener('change', updateSetupWizardProviderUI);
}
if (openSetupWizardBtn) {
    openSetupWizardBtn.addEventListener('click', () => openSetupWizard());
}
if (setupWizardSaveBtn) {
    setupWizardSaveBtn.addEventListener('click', saveSetupWizardSettings);
}
if (setupWizardCancelBtn) {
    setupWizardCancelBtn.addEventListener('click', () => {
        closeSetupWizard(true);
        setStatus('Setup closed. Reopen anytime from AI Settings.', 'warning');
    });
}
if (setupWizardSkipBtn) {
    setupWizardSkipBtn.addEventListener('click', () => {
        closeSetupWizard(true);
        setStatus('Setup skipped. You can reopen it anytime from AI Settings.', 'warning');
    });
}
if (setupWizardBackdrop) {
    setupWizardBackdrop.addEventListener('click', (event) => {
        if (event.target === setupWizardBackdrop) {
            closeSetupWizard(true);
            setStatus('Setup closed. Reopen anytime from AI Settings.', 'warning');
        }
    });
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && setupWizardBackdrop && !setupWizardBackdrop.classList.contains('hidden')) {
        closeSetupWizard(true);
        setStatus('Setup closed. Reopen anytime from AI Settings.', 'warning');
    }
});
refreshModelsBtn.addEventListener('click', () => fetchOllamaModels(ollamaModelSelect.value));
ollamaHostInput.addEventListener('change', () => fetchOllamaModels(ollamaModelSelect.value));
ollamaModelSelect.addEventListener('change', saveAiSettings);
useLocalOllamaBtn.addEventListener('click', () => {
    applyOllamaHost('http://localhost:11434', 'Using local Ollama on this PC');
});
useRemoteOllamaBtn.addEventListener('click', () => {
    const seed = remoteOllamaHostHint
        || (!isLocalOllamaHost(ollamaHostInput.value) ? (normalizeOllamaHost(ollamaHostInput.value) || ollamaHostInput.value.trim()) : '')
        || '192.168.1.25:11434';
    const entered = window.prompt(
        'Enter remote Ollama IP/URL (example: 192.168.1.25 or http://192.168.1.25:11434):',
        seed
    );
    if (entered === null) {
        return;
    }
    applyOllamaHost(entered, `Using remote Ollama: ${normalizeOllamaHost(entered) || entered}`);
});
importCustomTermsBtn.addEventListener('click', () => {
    customTermsFileInput.click();
});
clearCustomTermsBtn.addEventListener('click', () => {
    customTermsInput.value = '';
    saveAiSettings();
});
customTermsFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = function () {
        const importedText = String(reader.result || '');
        const merged = parseCustomTerms([customTermsInput.value, importedText].join('\n'));
        customTermsInput.value = merged.join('\n');
        saveAiSettings();
    };
    reader.onerror = function () {
        alert('Could not read terms file.');
    };
    reader.readAsText(file);
    customTermsFileInput.value = '';
});

pagePresetSelect.addEventListener('change', () => {
    const preset = pagePresetSelect.value;
    if (preset === 'custom') {
        onPageSettingsEdited();
        return;
    }
    setPagePreset(preset);
    saveAiSettings();
    if (currentViewMode === 'page') {
        renderCurrentPreview();
    }
});
[
    pageFontSizeInput,
    pageLineHeightInput,
    pageParagraphSpacingInput,
    pageMarginTopInput,
    pageMarginBottomInput,
    pageMarginLeftInput,
    pageMarginRightInput
].forEach((el) => {
    el.addEventListener('change', onPageSettingsEdited);
    el.addEventListener('input', onPageSettingsEdited);
});

applyAiAdvancedSettingsToInputs(AI_ADVANCED_DEFAULTS);
loadAiSettings();
if (!pagePresetSelect.value) {
    setPagePreset('manuscript_default');
}
updateAiProviderUI();
maybeShowSetupWizardOnFirstRun();
[
    aiEnabled,
    aiProvider,
    geminiModelInput,
    openrouterModelInput,
    agentRouterModelInput,
    ollamaHostInput,
    geminiApiKeyInput,
    openrouterApiKeyInput,
    aiSectionWiseInput,
    aiSectionThresholdCharsInput,
    aiSectionThresholdParagraphsInput,
    aiSectionChunkCharsInput,
    aiSectionChunkLinesInput,
    aiGlobalConsistencyMaxCharsInput,
    domainProfileSelect,
    customTermsInput,
    referenceProfileSelect
].forEach((el) => {
    el.addEventListener('change', saveAiSettings);
    el.addEventListener('input', saveAiSettings);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'txt' && ext !== 'docx') {
        alert('Please select a .txt or .docx file');
        return;
    }
    setStatus('Loading file...', 'warning');

    if (ext === 'txt') {
        const reader = new FileReader();
        reader.onload = function () {
            eel.load_text_content(file.name, reader.result)(handleLoadResponse(file.name));
        };
        reader.onerror = function () {
            setStatus('Error loading file', 'error');
            alert('Error reading .txt file');
        };
        reader.readAsText(file);
        return;
    }

    const reader = new FileReader();
    reader.onload = function () {
        const bytes = new Uint8Array(reader.result);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        eel.load_docx_content(file.name, base64)(handleLoadResponse(file.name));
    };
    reader.onerror = function () {
        setStatus('Error loading file', 'error');
        alert('Error reading .docx file');
    };
    reader.readAsArrayBuffer(file);
}

function handleLoadResponse(displayName) {
    return function (response) {
        if (response.success) {
            fileContent.original = response.text;
            fileContent.fileName = displayName;
            fileContent.corrected = '';
            fileContent.fullCorrectedText = '';
            fileContent.correctedAnnotatedHtml = '';
            fileContent.redline = '';
            fileContent.corrections = null;
            fileContent.nounReport = null;
            fileContent.domainReport = null;
            fileContent.journalProfileReport = null;
            fileContent.citationReferenceReport = null;
            fileContent.groupDecisions = null;
            fileContent.processingAudit = null;
            document.getElementById('file-name').textContent = displayName;
            document.getElementById('word-count').textContent = 'Words: ' + response.word_count;
            switch_tab('original');
            document.getElementById('save-clean-btn').disabled = true;
            document.getElementById('save-highlight-btn').disabled = true;
            setStatus('File loaded successfully', 'success');
        } else {
            setStatus('Error loading file', 'error');
            alert('Error loading file: ' + response.error);
        }
    };
}

function switch_tab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    if (tab === 'redline') {
        if (!fileContent.redline && fileContent.corrected && typeof eel !== 'undefined' && typeof eel.get_redline_preview === 'function') {
            try {
                eel.get_redline_preview()(function (response) {
                    if (response && response.success) {
                        fileContent.redline = response.redline_html || '';
                    }
                    if (currentTab === 'redline') {
                        renderCurrentPreview();
                    }
                });
            } catch (err) {
                renderCurrentPreview();
            }
            renderCurrentPreview();
            return;
        }
    }
    renderCurrentPreview();
}

function switch_view(mode) {
    if (mode !== 'rich' && mode !== 'plain' && mode !== 'page' && mode !== 'compare') {
        return;
    }
    currentViewMode = mode;
    pageControls.classList.toggle('hidden', mode !== 'page');
    document.querySelectorAll('.view-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    renderCurrentPreview();
}

function setStatus(message, type) {
    const statusEl = document.getElementById('status');
    const footerStatusEl = document.getElementById('footer-status');
    statusEl.textContent = message;
    footerStatusEl.textContent = message;

    const colors = {
        info: '#a0a0a0',
        success: '#4ecca3',
        warning: '#ffc107',
        error: '#e94560'
    };
    statusEl.style.color = colors[type] || colors.info;
}

function setProgress(progress) {
    document.getElementById('progress-fill').style.width = progress + '%';
}

function applyProcessResponseToState(response, options = {}) {
    const opts = options || {};
    const keepGroupDecisions = opts.keepGroupDecisions === true;
    fileContent.corrected = response.text;
    fileContent.original = response.original;
    fileContent.fullCorrectedText = response.full_corrected_text || response.text || '';
    fileContent.correctedAnnotatedHtml = response.corrected_annotated_html || '';
    fileContent.redline = response.redline_html || '';
    fileContent.corrections = response.corrections_report || null;
    fileContent.nounReport = response.noun_report || null;
    fileContent.domainReport = response.domain_report || null;
    fileContent.journalProfileReport = response.journal_profile_report || null;
    fileContent.citationReferenceReport = response.citation_reference_report || null;
    fileContent.processingAudit = response.processing_audit || null;
    fileContent.groupDecisions = keepGroupDecisions
        ? normalizeGroupDecisions(fileContent.groupDecisions)
        : buildDefaultGroupDecisions();
}

function process_document() {
    if (!fileContent.original) {
        alert('Please load a document first.');
        return;
    }

    setStatus('Processing...', 'warning');
    setProgress(30);
    document.getElementById('process-btn').disabled = true;
    const aiAdvanced = readAiAdvancedSettingsFromInputs();

    const options = {
        spelling: document.getElementById('opt-spelling').checked,
        sentence_case: document.getElementById('opt-sentence').checked,
        punctuation: document.getElementById('opt-punctuation').checked,
        chicago_style: document.getElementById('opt-chicago').checked,
        domain_profile: domainProfileSelect.value || 'auto',
        custom_terms: parseCustomTerms(customTermsInput.value),
        journal_profile: normalizeJournalProfile(referenceProfileSelect.value),
        reference_profile: normalizeJournalProfile(referenceProfileSelect.value),
        ai: {
            enabled: aiEnabled.checked,
            provider: aiProvider.value,
            model: getCurrentAiModel(),
            ollama_host: ollamaHostInput.value.trim(),
            api_key: geminiApiKeyInput.value.trim(),
            gemini_api_key: geminiApiKeyInput.value.trim(),
            openrouter_api_key: openrouterApiKeyInput.value.trim(),
            section_wise: aiAdvanced.section_wise,
            section_threshold_chars: aiAdvanced.section_threshold_chars,
            section_threshold_paragraphs: aiAdvanced.section_threshold_paragraphs,
            section_chunk_chars: aiAdvanced.section_chunk_chars,
            section_chunk_lines: aiAdvanced.section_chunk_lines,
            global_consistency_max_chars: aiAdvanced.global_consistency_max_chars
        }
    };
    saveAiSettings();

    eel.process_document(options)(function(response) {
        if (response.success) {
            applyProcessResponseToState(response, { keepGroupDecisions: false });
            if (fileContent.processingAudit && fileContent.processingAudit.mode === 'sectioned') {
                console.info('Section audit:', fileContent.processingAudit);
            }
            switch_tab('corrected');
            document.getElementById('word-count').textContent = 'Words: ' + response.word_count;
            document.getElementById('save-clean-btn').disabled = false;
            document.getElementById('save-highlight-btn').disabled = false;
            if (response.processing_note && response.processing_note.toLowerCase().includes('fallback')) {
                setStatus('Processing complete (safe fallback applied)', 'warning');
                if (typeof response.processing_note === 'string' && response.processing_note.trim()) {
                    console.warn('Processing note:', response.processing_note);
                }
            } else {
                setStatus('Processing complete', 'success');
            }
            setProgress(100);
        } else {
            setStatus('Error: ' + response.error, 'error');
            alert('Processing error: ' + response.error);
        }
        document.getElementById('process-btn').disabled = false;
    });
}

function applyCurrentGroupDecisions() {
    if (isApplyingGroupDecisions) {
        pendingGroupDecisionApply = true;
        return;
    }
    if (!fileContent.original || !fileContent.corrected) {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.apply_correction_group_decisions !== 'function') {
        return;
    }

    isApplyingGroupDecisions = true;
    setStatus('Applying change decisions...', 'warning');
    const payload = {
        group_decisions: normalizeGroupDecisions(fileContent.groupDecisions),
        original_text: fileContent.original || '',
        full_corrected_text: fileContent.fullCorrectedText || fileContent.corrected || ''
    };
    eel.apply_correction_group_decisions(payload)(function(response) {
        isApplyingGroupDecisions = false;
        const hadPending = pendingGroupDecisionApply;
        pendingGroupDecisionApply = false;
        if (response && response.success) {
            applyProcessResponseToState(response, { keepGroupDecisions: true });
            renderCurrentPreview();
            setStatus('Decision update applied', 'success');
            if (hadPending) {
                applyCurrentGroupDecisions();
            }
            return;
        }
        const err = response && response.error ? String(response.error) : 'Could not apply decisions';
        setStatus('Decision update failed', 'error');
        alert('Decision update error: ' + err);
        if (hadPending) {
            applyCurrentGroupDecisions();
        }
    });
}

function setGroupDecision(groupKey, accepted) {
    if (!CORRECTION_GROUP_ORDER.includes(groupKey)) {
        return;
    }
    fileContent.groupDecisions = normalizeGroupDecisions(fileContent.groupDecisions);
    fileContent.groupDecisions[groupKey] = !!accepted;
    if (currentTab === 'corrections') {
        renderCurrentPreview();
    }
    applyCurrentGroupDecisions();
}

function applyAllGroupDecisions(accepted) {
    const next = buildDefaultGroupDecisions();
    CORRECTION_GROUP_ORDER.forEach((key) => {
        next[key] = !!accepted;
    });
    fileContent.groupDecisions = next;
    if (currentTab === 'corrections') {
        renderCurrentPreview();
    }
    applyCurrentGroupDecisions();
}

function save_file(file_type) {
    function buildSaveErrorMessage(response, fallbackLabel) {
        const code = response && response.error_code ? String(response.error_code) : 'UNKNOWN_SAVE_ERROR';
        const message = response && response.error ? String(response.error) : 'Unknown save error';
        const source = fallbackLabel ? ` (${fallbackLabel})` : '';
        return `Save failed${source}\nCode: ${code}\nMessage: ${message}`;
    }

    function fallbackLegacySave() {
        eel.save_file(file_type)(function(response) {
            if (response.success) {
                setStatus(file_type + ' version saved', 'success');
                let msg = 'File saved to:\n' + response.path;
                if (response.note) {
                    msg += '\n\nNote:\n' + response.note;
                }
                alert(msg);
            } else {
                setStatus('Save failed', 'error');
                alert(buildSaveErrorMessage(response, 'legacy save'));
            }
        });
    }

    function downloadBase64Docx(base64Data, fileName, mimeType) {
        const binary = atob(String(base64Data || ''));
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'manuscript.docx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    if (typeof eel === 'undefined' || typeof eel.export_file !== 'function') {
        fallbackLegacySave();
        return;
    }

    setStatus('Preparing download...', 'warning');
    eel.export_file({
        file_type: file_type,
        original_text: fileContent.original || '',
        corrected_text: fileContent.corrected || '',
        file_name: fileContent.fileName || 'manuscript.docx'
    })(function(response) {
        if (response && response.success && response.base64_data) {
            downloadBase64Docx(response.base64_data, response.file_name, response.mime_type);
            setStatus(file_type + ' version downloaded', 'success');
            return;
        }
        if (response && response.error) {
            const code = response.error_code ? ` [${response.error_code}]` : '';
            console.warn('Browser download failed, trying legacy save:' + code, response.error);
        }
        fallbackLegacySave();
    });
}

function clear_all() {
    if (typeof eel !== 'undefined' && typeof eel.reset_session === 'function') {
        try {
            eel.reset_session()(function () {});
        } catch (err) {
            console.warn('Could not reset backend session state', err);
        }
    }

    fileContent = {
        original: '',
        fileName: '',
        corrected: '',
        fullCorrectedText: '',
        correctedAnnotatedHtml: '',
        redline: '',
        corrections: null,
        nounReport: null,
        domainReport: null,
        journalProfileReport: null,
        citationReferenceReport: null,
        groupDecisions: null,
        processingAudit: null
    };
    window.fileContent = fileContent;
    document.getElementById('file-name').textContent = 'No file selected';
    document.getElementById('word-count').textContent = 'Words: 0';
    document.getElementById('save-clean-btn').disabled = true;
    document.getElementById('save-highlight-btn').disabled = true;
    document.getElementById('file-input').value = '';
    switch_tab('original');
    setStatus('Ready', 'info');
    setProgress(0);
}

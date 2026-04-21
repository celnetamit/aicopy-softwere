const appPreviewRoot = window.ManuscriptEditorApp;
const previewState = appPreviewRoot.state;
const previewDom = appPreviewRoot.dom;
const previewHelpers = appPreviewRoot.helpers;
const previewConstants = appPreviewRoot.constants;

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

function buildDefaultGroupDecisions() {
    const decisions = {};
    previewConstants.CORRECTION_GROUP_ORDER.forEach((key) => {
        decisions[key] = true;
    });
    return decisions;
}

function normalizeGroupDecisions(raw) {
    const base = buildDefaultGroupDecisions();
    if (!raw || typeof raw !== 'object') {
        return base;
    }
    previewConstants.CORRECTION_GROUP_ORDER.forEach((key) => {
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
        section_threshold_chars: previewHelpers.clampInt(base.section_threshold_chars, 4000, 120000, previewConstants.AI_ADVANCED_DEFAULTS.section_threshold_chars),
        section_threshold_paragraphs: previewHelpers.clampInt(base.section_threshold_paragraphs, 20, 1000, previewConstants.AI_ADVANCED_DEFAULTS.section_threshold_paragraphs),
        section_chunk_chars: previewHelpers.clampInt(base.section_chunk_chars, 1800, 30000, previewConstants.AI_ADVANCED_DEFAULTS.section_chunk_chars),
        section_chunk_lines: previewHelpers.clampInt(base.section_chunk_lines, 8, 200, previewConstants.AI_ADVANCED_DEFAULTS.section_chunk_lines),
        global_consistency_max_chars: previewHelpers.clampInt(base.global_consistency_max_chars, 6000, 120000, previewConstants.AI_ADVANCED_DEFAULTS.global_consistency_max_chars)
    };
}

function readAiAdvancedSettingsFromInputs() {
    return sanitizeAiAdvancedSettings({
        section_wise: previewDom.aiSectionWiseInput.checked,
        section_threshold_chars: previewDom.aiSectionThresholdCharsInput.value,
        section_threshold_paragraphs: previewDom.aiSectionThresholdParagraphsInput.value,
        section_chunk_chars: previewDom.aiSectionChunkCharsInput.value,
        section_chunk_lines: previewDom.aiSectionChunkLinesInput.value,
        global_consistency_max_chars: previewDom.aiGlobalConsistencyMaxCharsInput.value
    });
}

function applyAiAdvancedSettingsToInputs(settings) {
    const safe = sanitizeAiAdvancedSettings(settings);
    previewDom.aiSectionWiseInput.checked = safe.section_wise;
    previewDom.aiSectionThresholdCharsInput.value = safe.section_threshold_chars;
    previewDom.aiSectionThresholdParagraphsInput.value = safe.section_threshold_paragraphs;
    previewDom.aiSectionChunkCharsInput.value = safe.section_chunk_chars;
    previewDom.aiSectionChunkLinesInput.value = safe.section_chunk_lines;
    previewDom.aiGlobalConsistencyMaxCharsInput.value = safe.global_consistency_max_chars;
}

function ptToPx(pt) {
    return pt * (96 / 72);
}

function inToPx(inches) {
    return inches * 96;
}

function sanitizePageSettings(settings) {
    const base = settings || {};
    const fallback = previewConstants.PAGE_PRESETS.manuscript_default;
    return {
        preset: base.preset || 'custom',
        marginTopIn: previewHelpers.clampNumber(base.marginTopIn, 0.5, 2.5, fallback.marginTopIn),
        marginBottomIn: previewHelpers.clampNumber(base.marginBottomIn, 0.5, 2.5, fallback.marginBottomIn),
        marginLeftIn: previewHelpers.clampNumber(base.marginLeftIn, 0.5, 2.5, fallback.marginLeftIn),
        marginRightIn: previewHelpers.clampNumber(base.marginRightIn, 0.5, 2.5, fallback.marginRightIn),
        fontPt: previewHelpers.clampNumber(base.fontPt, 9, 16, fallback.fontPt),
        lineHeight: previewHelpers.clampNumber(base.lineHeight, 1.1, 2.2, fallback.lineHeight),
        paragraphSpacingPt: previewHelpers.clampNumber(base.paragraphSpacingPt, 0, 20, fallback.paragraphSpacingPt)
    };
}

function applyPageSettingsToInputs(settings) {
    previewDom.pagePresetSelect.value = settings.preset || 'custom';
    previewDom.pageFontSizeInput.value = settings.fontPt;
    previewDom.pageLineHeightInput.value = settings.lineHeight;
    previewDom.pageParagraphSpacingInput.value = settings.paragraphSpacingPt;
    previewDom.pageMarginTopInput.value = settings.marginTopIn;
    previewDom.pageMarginBottomInput.value = settings.marginBottomIn;
    previewDom.pageMarginLeftInput.value = settings.marginLeftIn;
    previewDom.pageMarginRightInput.value = settings.marginRightIn;
}

function readPageSettingsFromInputs() {
    return sanitizePageSettings({
        preset: previewDom.pagePresetSelect.value || 'custom',
        fontPt: previewDom.pageFontSizeInput.value,
        lineHeight: previewDom.pageLineHeightInput.value,
        paragraphSpacingPt: previewDom.pageParagraphSpacingInput.value,
        marginTopIn: previewDom.pageMarginTopInput.value,
        marginBottomIn: previewDom.pageMarginBottomInput.value,
        marginLeftIn: previewDom.pageMarginLeftInput.value,
        marginRightIn: previewDom.pageMarginRightInput.value
    });
}

function applyPageStyleVariables() {
    const preview = document.getElementById('preview-text');
    const fontSizePx = ptToPx(previewState.pageSettings.fontPt);
    const paraSpacingPx = ptToPx(previewState.pageSettings.paragraphSpacingPt);
    preview.style.setProperty('--page-width-px', `${previewConstants.A4_WIDTH_PX.toFixed(1)}px`);
    preview.style.setProperty('--page-height-px', `${previewConstants.A4_HEIGHT_PX.toFixed(1)}px`);
    preview.style.setProperty('--page-margin-top-px', `${inToPx(previewState.pageSettings.marginTopIn).toFixed(1)}px`);
    preview.style.setProperty('--page-margin-bottom-px', `${inToPx(previewState.pageSettings.marginBottomIn).toFixed(1)}px`);
    preview.style.setProperty('--page-margin-left-px', `${inToPx(previewState.pageSettings.marginLeftIn).toFixed(1)}px`);
    preview.style.setProperty('--page-margin-right-px', `${inToPx(previewState.pageSettings.marginRightIn).toFixed(1)}px`);
    preview.style.setProperty('--page-font-size-px', `${fontSizePx.toFixed(2)}px`);
    preview.style.setProperty('--page-line-height', String(previewState.pageSettings.lineHeight));
    preview.style.setProperty('--page-para-spacing-px', `${paraSpacingPx.toFixed(2)}px`);
    preview.style.setProperty('--page-h2-size-px', `${(fontSizePx * 1.25).toFixed(2)}px`);
    preview.style.setProperty('--page-h3-size-px', `${(fontSizePx * 1.05).toFixed(2)}px`);
}

function setPagePreset(presetName) {
    const preset = previewConstants.PAGE_PRESETS[presetName];
    if (!preset) {
        return;
    }
    previewState.pageSettings = sanitizePageSettings({ ...preset, preset: presetName });
    applyPageSettingsToInputs(previewState.pageSettings);
    applyPageStyleVariables();
}

function onPageSettingsEdited() {
    previewState.pageSettings = readPageSettingsFromInputs();
    if (previewState.pageSettings.preset !== 'custom') {
        previewState.pageSettings.preset = 'custom';
        previewDom.pagePresetSelect.value = 'custom';
    }
    applyPageStyleVariables();
    appPreviewRoot.settings.saveAiSettings();
    if (previewState.currentViewMode === 'page') {
        renderCurrentPreview();
    }
}

function isSectionHeading(text) {
    const normalized = text.trim();
    if (!normalized) return false;
    if (/^(abstract|introduction|methodology|methods|results|discussion|conclusion|references|keywords?)$/i.test(normalized)) return true;
    return /^[A-Z][A-Za-z0-9,&:()'’\-./ ]+$/.test(normalized) && normalized.length < 110 && !/[.!?]$/.test(normalized);
}

function renderRichDocument(content, isHtmlInput) {
    const segments = previewHelpers.buildPreviewSegments(content, isHtmlInput);
    let html = '<div class="doc-preview">';
    let activeList = null;
    let sawFirstHeading = false;

    function closeList() {
        if (!activeList) return;
        html += activeList === 'bullet' ? '</ul>' : '</ol>';
        activeList = null;
    }

    function openList(type) {
        if (activeList === type) return;
        closeList();
        html += type === 'bullet'
            ? '<ul class="doc-list">'
            : type === 'reference'
                ? '<ol class="doc-list doc-list-ref">'
                : '<ol class="doc-list">';
        activeList = type;
    }

    function toBodyFromLine(rawLine, plainLine, markerRegex) {
        return isHtmlInput
            ? rawLine.replace(markerRegex, '').trim()
            : previewHelpers.escapeHtml(plainLine.replace(markerRegex, '').trim());
    }

    for (const segment of segments) {
        if (segment.kind === 'figure') {
            closeList();
            html += previewHelpers.renderFigurePreviewCard(segment);
            continue;
        }
        const rawLine = segment.rawLine;
        const plainLine = segment.plainLine.trim();
        if (!plainLine) {
            closeList();
            html += '<div class="doc-gap"></div>';
            continue;
        }

        const referenceMatch = plainLine.match(/^\[(\d+)\]\s+(.+)/);
        if (referenceMatch) {
            openList('reference');
            html += `<li value="${parseInt(referenceMatch[1], 10)}">${toBodyFromLine(rawLine, plainLine, /^\[\d+\]\s+/)}</li>`;
            continue;
        }
        const numberedMatch = plainLine.match(/^(\d+)[.)]\s+(.+)/);
        if (numberedMatch) {
            openList('numbered');
            html += `<li value="${parseInt(numberedMatch[1], 10)}">${toBodyFromLine(rawLine, plainLine, /^\d+[.)]\s+/)}</li>`;
            continue;
        }
        const bulletMatch = plainLine.match(/^[-*•]\s+(.+)/);
        if (bulletMatch) {
            openList('bullet');
            html += `<li>${toBodyFromLine(rawLine, plainLine, /^[-*•]\s+/)}</li>`;
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
    const segments = previewHelpers.buildPreviewSegments(content, isHtmlInput);
    const blocks = [];
    let sawFirstHeading = false;

    function lineBody(rawLine, plainLine, markerRegex) {
        return isHtmlInput ? rawLine.replace(markerRegex, '').trim() : previewHelpers.escapeHtml(plainLine.replace(markerRegex, '').trim());
    }

    for (const segment of segments) {
        if (segment.kind === 'figure') {
            blocks.push({
                kind: 'figure',
                plain: segment.caption || (Array.isArray(segment.labels) ? segment.labels.join(' ') : 'Figure preview'),
                html: previewHelpers.renderFigurePreviewCard(segment, true)
            });
            continue;
        }
        const rawLine = segment.rawLine;
        const plainLine = segment.plainLine.trim();
        if (!plainLine) {
            blocks.push({ kind: 'gap', plain: '' });
            continue;
        }
        const referenceMatch = plainLine.match(/^\[(\d+)\]\s+(.+)/);
        if (referenceMatch) {
            blocks.push({ kind: 'ref', plain: referenceMatch[2], marker: `[${referenceMatch[1]}]`, html: lineBody(rawLine, plainLine, /^\[\d+\]\s+/) });
            continue;
        }
        const numberedMatch = plainLine.match(/^(\d+)[.)]\s+(.+)/);
        if (numberedMatch) {
            blocks.push({ kind: 'numbered', plain: numberedMatch[2], marker: `${numberedMatch[1]}.`, html: lineBody(rawLine, plainLine, /^\d+[.)]\s+/) });
            continue;
        }
        const bulletMatch = plainLine.match(/^[-*•]\s+(.+)/);
        if (bulletMatch) {
            blocks.push({ kind: 'bullet', plain: bulletMatch[1], marker: '•', html: lineBody(rawLine, plainLine, /^[-*•]\s+/) });
            continue;
        }
        if (isSectionHeading(plainLine)) {
            blocks.push({ kind: sawFirstHeading ? 'h3' : 'h2', plain: plainLine, html: rawLine });
            sawFirstHeading = true;
            continue;
        }
        blocks.push({ kind: 'p', plain: plainLine, html: rawLine });
    }

    const fontSizePx = ptToPx(previewState.pageSettings.fontPt);
    const linePx = fontSizePx * previewState.pageSettings.lineHeight;
    const paraSpacingPx = ptToPx(previewState.pageSettings.paragraphSpacingPt);
    const contentWidthPx = previewConstants.A4_WIDTH_PX - inToPx(previewState.pageSettings.marginLeftIn) - inToPx(previewState.pageSettings.marginRightIn);
    const charsPerLine = Math.max(34, Math.floor(contentWidthPx / Math.max(5.5, fontSizePx * 0.52)));
    const h2LinePx = fontSizePx * 1.25 * 1.22;
    const h3LinePx = fontSizePx * 1.05 * 1.18;

    function estimateBlockHeight(block) {
        const textLen = (block.plain || '').length;
        const estimatedLines = Math.max(1, Math.ceil(textLen / charsPerLine));
        if (block.kind === 'h2') return 10 + estimatedLines * h2LinePx;
        if (block.kind === 'h3') return 8 + estimatedLines * h3LinePx;
        if (block.kind === 'gap') return Math.max(8, linePx * 0.5);
        return estimatedLines * linePx + paraSpacingPx;
    }

    function blockToHtml(block) {
        if (block.kind === 'gap') return '<div class="doc-gap"></div>';
        if (block.kind === 'h2') return `<h2>${block.html}</h2>`;
        if (block.kind === 'h3') return `<h3>${block.html}</h3>`;
        if (block.kind === 'figure') return block.html;
        if (block.kind === 'bullet' || block.kind === 'numbered' || block.kind === 'ref') {
            return `<p class="page-list-item"><span class="page-list-marker">${block.marker}</span>${block.html}</p>`;
        }
        return `<p>${block.html}</p>`;
    }

    const maxPageHeight = Math.max(320, previewConstants.A4_HEIGHT_PX - inToPx(previewState.pageSettings.marginTopIn) - inToPx(previewState.pageSettings.marginBottomIn) - 40);
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
    if (current.length > 0 || pages.length === 0) pages.push(current);

    let html = '<div class="page-stack">';
    pages.forEach((pageBlocks, index) => {
        html += '<article class="page-sheet">';
        pageBlocks.forEach((block) => {
            html += blockToHtml(block);
        });
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
    previewConstants.CORRECTION_GROUP_ORDER.forEach((groupKey) => {
        const label = previewConstants.CORRECTION_GROUP_LABEL[groupKey] || groupKey;
        const accepted = !!safeDecisions[groupKey];
        html += '<div class="decision-item">';
        html += `<div class="decision-label">${previewHelpers.escapeHtml(label)}</div>`;
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
    html += `<div class="cor-summary">Domain dictionary: <strong>${previewHelpers.escapeHtml(domainProfile)}</strong> | Protected terms: <strong>${protectedTerms}</strong></div>`;
    const customTermsCount = safeDomain ? Number(safeDomain.custom_terms || 0) : 0;
    if (customTermsCount > 0) {
        html += `<div class="cor-summary">Custom glossary terms: <strong>${customTermsCount}</strong></div>`;
    }
    const safeAudit = processingAudit && typeof processingAudit === 'object' ? processingAudit : null;
    const auditSummary = safeAudit && safeAudit.summary && typeof safeAudit.summary === 'object'
        ? safeAudit.summary
        : {};
    const docxPackageFeatures = auditSummary.docx_package_features && typeof auditSummary.docx_package_features === 'object'
        ? auditSummary.docx_package_features
        : null;
    const cmosGuardrails = auditSummary.cmos_guardrails && typeof auditSummary.cmos_guardrails === 'object'
        ? auditSummary.cmos_guardrails
        : null;
    if (cmosGuardrails) {
        const score = Number(cmosGuardrails.compliance_score || 0);
        const status = String(cmosGuardrails.status || 'needs_attention');
        const statusLabel = status === 'strong'
            ? 'Strong'
            : (status === 'at_risk' ? 'At Risk' : 'Needs Attention');
        const warnings = Array.isArray(cmosGuardrails.warnings) ? cmosGuardrails.warnings : [];
        const recommendations = Array.isArray(cmosGuardrails.recommendations) ? cmosGuardrails.recommendations : [];
        html += '<section class="profile-card">';
        html += '<div class="profile-title">CMOS Workflow Guardrails</div>';
        html += `<div class="profile-summary">Strict mode: <strong>${cmosGuardrails.strict_mode ? 'On' : 'Off'}</strong> | Compliance score: <strong>${Number.isFinite(score) ? score : 0}</strong> | Status: <strong>${previewHelpers.escapeHtml(statusLabel)}</strong></div>`;
        html += '<div class="profile-rules">';
        html += `<span class="profile-chip">Requested domain: ${previewHelpers.escapeHtml(String(cmosGuardrails.requested_domain || 'auto'))}</span>`;
        html += `<span class="profile-chip">Detected domain: ${previewHelpers.escapeHtml(String(cmosGuardrails.detected_domain || 'general'))}</span>`;
        html += `<span class="profile-chip">Protected terms: ${Number(cmosGuardrails.protected_terms || 0)}</span>`;
        html += `<span class="profile-chip">Custom terms: ${Number(cmosGuardrails.custom_terms || 0)}</span>`;
        html += '</div>';
        if (warnings.length > 0) {
            html += '<div class="profile-validation">';
            html += '<div class="profile-validation-title">Warnings</div><ul>';
            warnings.forEach((message) => {
                html += `<li>${previewHelpers.escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul></div>';
        }
        if (recommendations.length > 0) {
            html += '<div class="profile-validation">';
            html += '<div class="profile-validation-title">Recommended Actions</div><ul>';
            recommendations.forEach((message) => {
                html += `<li>${previewHelpers.escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul></div>';
        }
        if (warnings.length === 0 && recommendations.length === 0) {
            html += '<div class="profile-ok">No CMOS guardrail concerns detected for this run.</div>';
        }
        html += '</section>';
    }
    if (docxPackageFeatures) {
        html += appPreviewRoot.authAdmin.renderDocxStructureSummary(docxPackageFeatures);
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
        const onlineValidation = safeValidator.online_validation && typeof safeValidator.online_validation === 'object'
            ? safeValidator.online_validation
            : null;
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
                html += `<span class="validator-chip">${previewHelpers.escapeHtml(humanizeCategory(code))}: ${Number(count || 0)}</span>`;
            });
            html += '</div>';
        }

        if (messages.length > 0) {
            html += '<div class="validator-messages">';
            html += '<div class="validator-messages-title">Warnings</div>';
            html += '<ul>';
            messages.forEach((message) => {
                html += `<li>${previewHelpers.escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        } else {
            html += '<div class="validator-ok">No citation/reference validation issues detected.</div>';
        }
        html += '</section>';

        if (onlineValidation) {
            const onlineSummary = onlineValidation.summary && typeof onlineValidation.summary === 'object'
                ? onlineValidation.summary
                : {};
            const onlineMessages = Array.isArray(onlineValidation.messages) ? onlineValidation.messages : [];
            const onlineEntries = Array.isArray(onlineValidation.entries) ? onlineValidation.entries : [];
            const flaggedEntries = onlineEntries
                .filter((item) => ['mismatch', 'not_found', 'ambiguous', 'error'].includes(String(item && item.status || '')))
                .slice(0, 8);
            const statusLabel = (value) => String(value || '')
                .replaceAll('_', ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());

            html += '<section class="validator-card">';
            html += '<div class="validator-title">Online Reference Validation</div>';
            html += '<div class="validator-grid">';
            html += `<div class="validator-item"><span>Status</span><strong>${onlineValidation.enabled ? 'On' : 'Off'}</strong></div>`;
            html += `<div class="validator-item"><span>Checked</span><strong>${Number(onlineSummary.checked || 0)}</strong></div>`;
            html += `<div class="validator-item"><span>Verified</span><strong>${Number(onlineSummary.verified || 0)}</strong></div>`;
            html += `<div class="validator-item"><span>Likely Match</span><strong>${Number(onlineSummary.likely_match || 0)}</strong></div>`;
            html += `<div class="validator-item"><span>Not Found</span><strong>${Number(onlineSummary.not_found || 0)}</strong></div>`;
            html += `<div class="validator-item"><span>Skipped</span><strong>${Number(onlineSummary.skipped || 0)}</strong></div>`;
            html += '</div>';

            if (onlineMessages.length > 0) {
                html += '<div class="validator-messages">';
                html += '<div class="validator-messages-title">Online Validation Notes</div><ul>';
                onlineMessages.forEach((message) => {
                    html += `<li>${previewHelpers.escapeHtml(String(message || ''))}</li>`;
                });
                html += '</ul></div>';
            }

            if (flaggedEntries.length > 0) {
                html += '<div class="validator-messages">';
                html += '<div class="validator-messages-title">References To Review</div><ul>';
                flaggedEntries.forEach((item) => {
                    const number = Number(item && item.number || 0);
                    const status = statusLabel(item && item.status);
                    const reason = String(item && item.reason || '');
                    const matchedTitle = String(item && item.matched_title || '');
                    const source = String(item && item.source || '');
                    let line = `[${number}] ${status}: ${reason}`;
                    if (matchedTitle) {
                        line += ` Match: ${matchedTitle}.`;
                    }
                    if (source) {
                        line += ` Source: ${source}.`;
                    }
                    html += `<li>${previewHelpers.escapeHtml(line)}</li>`;
                });
                html += '</ul></div>';
            } else if (onlineValidation.enabled && Number(onlineSummary.checked || 0) > 0) {
                html += '<div class="validator-ok">No online reference mismatches were flagged in the checked journal references.</div>';
            }
            html += '</section>';
        }
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
        html += `<div class="profile-summary">Profile: <strong>${previewHelpers.escapeHtml(profileLabel)}</strong> | References detected: <strong>${referenceCount}</strong></div>`;
        html += '<div class="profile-rules">';
        html += `<span class="profile-chip">Initials: ${previewHelpers.escapeHtml(ruleInitials)}</span>`;
        html += `<span class="profile-chip">Title case: ${previewHelpers.escapeHtml(ruleTitleCase)}</span>`;
        html += `<span class="profile-chip">Journal names: ${previewHelpers.escapeHtml(ruleJournalNames)}</span>`;
        html += '</div>';
        if (validationMessages.length > 0) {
            html += '<div class="profile-validation">';
            html += '<div class="profile-validation-title">Profile-aware validation</div>';
            html += '<ul>';
            validationMessages.forEach((message) => {
                html += `<li>${previewHelpers.escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        } else {
            html += '<div class="profile-ok">No profile mismatches detected in references.</div>';
        }
        html += '</section>';
    }

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
        html += `<div><span class="audit-label">Consistency Pass:</span> <strong>${previewHelpers.escapeHtml(consistencyDecision)}</strong></div>`;
        html += `<div><span class="audit-label">Quality Delta:</span> <strong>${previewHelpers.escapeHtml(consistencyDeltaText)}</strong></div>`;
        if (consistencyReason) {
            html += `<div class="audit-note">${previewHelpers.escapeHtml(consistencyReason)}</div>`;
        }
        html += '</div>';

        if (reasonItems.length > 0) {
            html += '<div class="audit-reasons">';
            reasonItems.forEach(([reason, count]) => {
                html += `<span class="audit-chip">${previewHelpers.escapeHtml(humanizeReason(reason))}: ${Number(count || 0)}</span>`;
            });
            html += '</div>';
        }

        html += '</section>';
    }

    const nouns = nounReport && typeof nounReport === 'object' ? nounReport : null;
    const properNouns = nouns && Array.isArray(nouns.proper_nouns) ? nouns.proper_nouns.slice(0, 12) : [];
    const commonNouns = nouns && Array.isArray(nouns.common_nouns) ? nouns.common_nouns.slice(0, 12) : [];
    const nounSource = nouns ? String(nouns.source || 'heuristic') : 'none';
    html += '<section class="cor-group">';
    html += `<h3>Nouns <span>${previewHelpers.escapeHtml(nounSource)}</span></h3>`;
    html += '<div class="noun-wrap">';
    html += '<div><div class="noun-label">Proper Nouns</div><div class="noun-chips">';
    if (properNouns.length === 0) {
        html += '<span class="noun-empty">None detected</span>';
    } else {
        properNouns.forEach((item) => {
            const word = previewHelpers.escapeHtml(String(item.word || ''));
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
            const word = previewHelpers.escapeHtml(String(item.word || ''));
            const count = Number(item.count || 0);
            html += `<span class="noun-chip common">${word}${count > 1 ? ` (${count})` : ''}</span>`;
        });
    }
    html += '</div></div>';
    html += '</div>';
    html += '</section>';

    const hasAny = previewConstants.CORRECTION_GROUP_ORDER.some((key) => (Array.isArray(groups[key]) && groups[key].length > 0));
    if (!hasAny) {
        html += '<p class="cor-empty">No differences detected between original and corrected text.</p>';
        html += '</div>';
        return html;
    }

    previewConstants.CORRECTION_GROUP_ORDER.forEach((groupKey) => {
        const items = Array.isArray(groups[groupKey]) ? groups[groupKey] : [];
        const count = Number(counts[groupKey] || items.length || 0);
        if (count <= 0 || items.length === 0) {
            return;
        }

        const label = previewConstants.CORRECTION_GROUP_LABEL[groupKey] || groupKey;
        html += '<section class="cor-group">';
        html += `<h3>${previewHelpers.escapeHtml(label)} <span>${count}</span></h3>`;
        html += '<ul>';

        items.forEach((item) => {
            const line = Number(item.line || 0);
            const oldText = previewHelpers.normalizeTextboxMarkersForDisplay(item.original || '');
            const newText = previewHelpers.normalizeTextboxMarkersForDisplay(item.corrected || '');
            const context = previewHelpers.normalizeTextboxMarkersForDisplay(item.context || '');
            const oldDisplay = oldText ? previewHelpers.escapeHtml(oldText) : '<em class="cor-empty-token">(none)</em>';
            const newDisplay = newText ? previewHelpers.escapeHtml(newText) : '<em class="cor-empty-token">(none)</em>';

            html += '<li>';
            html += `<div class="cor-line">Line ${line > 0 ? line : '-'}</div>`;
            html += `<div class="cor-change"><span class="cor-old">${oldDisplay}</span><span class="cor-arrow">→</span><span class="cor-new">${newDisplay}</span></div>`;
            if (context) {
                html += `<div class="cor-context">${previewHelpers.escapeHtml(context)}</div>`;
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
    if (previewState.currentTab === 'corrections') {
        preview.innerHTML = renderCorrectionsPanel(
            previewState.fileContent.corrections,
            previewState.fileContent.nounReport,
            previewState.fileContent.domainReport,
            previewState.fileContent.journalProfileReport,
            previewState.fileContent.citationReferenceReport,
            previewState.fileContent.processingAudit,
            previewState.fileContent.groupDecisions
        );
        return;
    }

    if (previewState.currentViewMode === 'compare') {
        const correctedHtml = previewState.fileContent.correctedAnnotatedHtml || '';
        const originalHtml = renderRichDocument(previewState.fileContent.original || '', false);
        const correctedViewHtml = correctedHtml ? renderRichDocument(correctedHtml, true) : renderRichDocument(previewState.fileContent.corrected || '', false);
        const redlineSource = previewState.fileContent.redline || previewState.fileContent.corrected || '';
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

    const tabValue = previewState.currentTab === 'redline'
        ? (previewState.fileContent.redline || previewState.fileContent.corrected || '')
        : (previewState.currentTab === 'corrected' ? (previewState.fileContent.corrected || '') : (previewState.fileContent[previewState.currentTab] || ''));
    const correctedHtml = previewState.fileContent.correctedAnnotatedHtml || '';

    if (previewState.currentViewMode === 'plain') {
        preview.textContent = previewState.currentTab === 'redline'
            ? previewHelpers.normalizeTextboxMarkersForDisplay(previewHelpers.stripHtml(tabValue))
            : previewHelpers.normalizeTextboxMarkersForDisplay(tabValue);
        return;
    }
    if (previewState.currentViewMode === 'page') {
        if (previewState.currentTab === 'redline') {
            preview.innerHTML = renderPageDocument(tabValue, true);
        } else if (previewState.currentTab === 'corrected' && correctedHtml) {
            preview.innerHTML = renderPageDocument(correctedHtml, true);
        } else {
            preview.innerHTML = renderPageDocument(tabValue, false);
        }
        return;
    }
    if (previewState.currentTab === 'redline') {
        preview.innerHTML = renderRichDocument(tabValue, true);
        return;
    }
    if (previewState.currentTab === 'corrected' && correctedHtml) {
        preview.innerHTML = renderRichDocument(correctedHtml, true);
        return;
    }
    preview.innerHTML = renderRichDocument(tabValue, false);
}

appPreviewRoot.preview = {
    parseCustomTerms,
    normalizeCustomTermsText,
    buildDefaultGroupDecisions,
    normalizeGroupDecisions,
    sanitizeAiAdvancedSettings,
    readAiAdvancedSettingsFromInputs,
    applyAiAdvancedSettingsToInputs,
    ptToPx,
    inToPx,
    sanitizePageSettings,
    applyPageSettingsToInputs,
    readPageSettingsFromInputs,
    applyPageStyleVariables,
    setPagePreset,
    onPageSettingsEdited,
    isSectionHeading,
    renderRichDocument,
    renderPageDocument,
    renderCorrectionsPanel,
    renderCurrentPreview
};

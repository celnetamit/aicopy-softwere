(function () {
    const app = window.ManuscriptEditorApp || (window.ManuscriptEditorApp = {});
    const state = app.state || {};
    const dom = app.dom || {};
    const auth = app.authAdmin || {};
    const preview = app.preview || {};
    const runtime = app.editorRuntime || {};
    const helpers = app.helpers || {};
    const ASSISTANT_CHAT_HISTORY_KEY = 'manuscript_editor_assistant_chat_v1';
    const ASSISTANT_REQUEST_TIMEOUT_MS = 15000;
    const requestLogEntries = [];
    let toastTimeoutId = null;
    let unreadCount = 0;
    let currentTaskKey = '';
    let actionInFlight = false;
    let pendingGuidedAction = '';

    function escapeHtml(value) {
        if (typeof helpers.escapeHtml === 'function') return helpers.escapeHtml(value);
        return String(value || '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    function setStatus(message, type) {
        if (typeof runtime.setStatus === 'function') runtime.setStatus(message, type);
    }

    function callApiOrEel(apiInvoker, eelMethod, eelArgs, callback) {
        if (typeof runtime.callApiOrEel === 'function') {
            return runtime.callApiOrEel(apiInvoker, eelMethod, eelArgs, callback);
        }
        return false;
    }

    function applyProcessResponseToState(response, options) {
        if (typeof runtime.applyProcessResponseToState === 'function') {
            runtime.applyProcessResponseToState(response, options || {});
        }
    }

    function switchTab(tabName) {
        if (typeof runtime.switch_tab === 'function') runtime.switch_tab(tabName);
    }

    function currentTaskId() {
        return String((state.fileContent || {}).taskId || '').trim();
    }

    function updateAssistantRouteHint() {
        if (!dom.assistantDashboardHint) return;
        const isDashboard = !!(auth && typeof auth.isTasksDashboardRoute === 'function' && auth.isTasksDashboardRoute());
        dom.assistantDashboardHint.classList.toggle('hidden', !isDashboard);
    }

    function setAssistantUnavailable(visible, detailMessage) {
        if (!dom.assistantUnavailableBanner) return;
        const show = visible === true;
        dom.assistantUnavailableBanner.classList.toggle('hidden', !show);
        if (show && detailMessage) {
            dom.assistantUnavailableBanner.textContent = `Assistant unavailable: ${String(detailMessage)}`;
        } else if (show) {
            dom.assistantUnavailableBanner.textContent = 'Assistant unavailable right now. Please retry in a moment.';
        }
    }

    function formatDiagnosticsTimestamp(value) {
        const ts = Number(value || 0);
        if (!Number.isFinite(ts) || ts <= 0) return 'never';
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return 'never';
        return date.toLocaleString();
    }

    function updateAssistantDiagnostics(status, errorMessage, successAt) {
        if (dom.assistantEndpointStatus) dom.assistantEndpointStatus.textContent = String(status || 'idle');
        if (dom.assistantLastError) dom.assistantLastError.textContent = String(errorMessage || 'none');
        if (dom.assistantLastSuccess) dom.assistantLastSuccess.textContent = formatDiagnosticsTimestamp(successAt);
    }

    function getAssistantTaskKey() {
        return String(currentTaskId() || 'global').trim() || 'global';
    }

    function readAssistantChatStore() {
        try {
            const raw = localStorage.getItem(ASSISTANT_CHAT_HISTORY_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
            return {};
        }
    }

    function writeAssistantChatStore(store) {
        try {
            localStorage.setItem(ASSISTANT_CHAT_HISTORY_KEY, JSON.stringify(store || {}));
        } catch (err) {}
    }

    function setAssistantUnreadCount(count) {
        unreadCount = Math.max(0, Number(count || 0));
        if (!dom.assistantUnreadBadge) return;
        dom.assistantUnreadBadge.classList.toggle('hidden', unreadCount <= 0);
        dom.assistantUnreadBadge.textContent = String(Math.min(99, unreadCount));
    }

    function showAssistantToast(message) {
        if (!dom.assistantToast) return;
        dom.assistantToast.textContent = String(message || '');
        dom.assistantToast.classList.remove('hidden');
        if (toastTimeoutId) {
            window.clearTimeout(toastTimeoutId);
            toastTimeoutId = null;
        }
        toastTimeoutId = window.setTimeout(() => {
            if (dom.assistantToast) dom.assistantToast.classList.add('hidden');
            toastTimeoutId = null;
        }, 3200);
    }

    function stageStatusLabel(status) {
        if (status === 'done') return 'Done';
        if (status === 'failed') return 'Failed';
        return 'Skipped';
    }

    function stageIcon(status) {
        if (status === 'done') return 'OK';
        if (status === 'failed') return 'ERR';
        return 'SKIP';
    }

    function renderAssistantRequestLog() {
        if (!dom.assistantRequestLogList) return;
        if (!requestLogEntries.length) {
            dom.assistantRequestLogList.textContent = 'No requests yet.';
            return;
        }
        const rows = requestLogEntries
            .slice(-10)
            .reverse()
            .map((entry) => {
                const statusRaw = String(entry.status || 'unknown');
                const badgeClass = statusRaw === 'success' ? 'done' : (statusRaw === 'timeout' ? 'failed' : 'skipped');
                return `<li>${escapeHtml(entry.action || 'assistant')}: <span class="stage-badge ${badgeClass}">${escapeHtml(statusRaw)}</span> | ${Number(entry.latencyMs || 0)}ms | retried=${entry.retried ? 'yes' : 'no'}</li>`;
            })
            .join('');
        dom.assistantRequestLogList.innerHTML = `<ul>${rows}</ul>`;
    }

    function pushAssistantRequestLogEntry(action, status, latencyMs, retried) {
        requestLogEntries.push({
            action: String(action || 'assistant'),
            status: String(status || 'unknown'),
            latencyMs: Math.max(0, Math.floor(Number(latencyMs || 0))),
            retried: retried === true,
        });
        while (requestLogEntries.length > 10) requestLogEntries.shift();
        renderAssistantRequestLog();
    }

    function buildUnresolvedSnapshotFromReport(reportInput) {
        const report = reportInput && typeof reportInput === 'object' ? reportInput : {};
        const online = report.online_validation && typeof report.online_validation === 'object' ? report.online_validation : {};
        const enrichment = online.enrichment && typeof online.enrichment === 'object' ? online.enrichment : {};
        const entries = Array.isArray(online.entries) ? online.entries : [];
        const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];
        const unresolvedTrail = trail.filter((item) => {
            const autofillStatus = String(item && item.autofill_status || 'none');
            return Boolean(item && item.doi_rejected) || Boolean(item && item.doi_needs_review) || autofillStatus !== 'full';
        });
        const unresolvedEntryStatuses = entries.filter((item) => ['mismatch', 'not_found', 'ambiguous', 'error'].includes(String(item && item.status || '')));
        const reasonCounts = {};
        unresolvedTrail.forEach((item) => {
            []
                .concat(Array.isArray(item && item.autofill_chips) ? item.autofill_chips : [])
                .concat(Array.isArray(item && item.auto_resolve_chips) ? item.auto_resolve_chips : [])
                .concat(Array.isArray(item && item.doi_reason_chips) ? item.doi_reason_chips : [])
                .forEach((chip) => {
                    const key = String(chip || '').trim();
                    if (key) reasonCounts[key] = Number(reasonCounts[key] || 0) + 1;
                });
        });
        return {
            unresolvedCount: Math.max(unresolvedTrail.length, Number(enrichment.still_unresolved || 0), unresolvedEntryStatuses.length),
            stillUnresolved: Number(enrichment.still_unresolved || 0),
            topReasons: Object.entries(reasonCounts).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 4).map((entry) => String(entry[0])),
        };
    }

    function buildUnresolvedRerunDelta(beforeReport, afterReport) {
        const before = buildUnresolvedSnapshotFromReport(beforeReport);
        const after = buildUnresolvedSnapshotFromReport(afterReport);
        return {
            before_unresolved: before.unresolvedCount,
            after_unresolved: after.unresolvedCount,
            resolved_delta: Math.max(0, before.unresolvedCount - after.unresolvedCount),
            regressed_delta: Math.max(0, after.unresolvedCount - before.unresolvedCount),
            still_unresolved: after.stillUnresolved,
            top_reasons_after: after.topReasons,
        };
    }

    function deriveRunStagesFromState() {
        const fileContent = state.fileContent || {};
        const report = fileContent.citationReferenceReport && typeof fileContent.citationReferenceReport === 'object' ? fileContent.citationReferenceReport : {};
        const online = report.online_validation && typeof report.online_validation === 'object' ? report.online_validation : {};
        const onlineSummary = online.summary && typeof online.summary === 'object' ? online.summary : {};
        const enrichment = online.enrichment && typeof online.enrichment === 'object' ? online.enrichment : {};
        const summary = report.summary && typeof report.summary === 'object' ? report.summary : {};
        const details = report.details && typeof report.details === 'object' ? report.details : {};
        const sourceTypeNumbers = details.source_type_numbers && typeof details.source_type_numbers === 'object' ? details.source_type_numbers : {};
        const bookValidation = details.book_validation && typeof details.book_validation === 'object' ? details.book_validation : {};
        const categoryCounts = report.category_counts && typeof report.category_counts === 'object' ? report.category_counts : {};
        const audit = fileContent.processingAudit && typeof fileContent.processingAudit === 'object' ? fileContent.processingAudit : {};
        const auditSummary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
        const mode = String(audit.mode || '').toLowerCase();
        const fallback = mode === 'rule_only' || Number(auditSummary.fallback_sections || 0) > 0;
        const refCount = Number(summary.references || 0);
        const bookCount = Number(bookValidation.total_books || (Array.isArray(sourceTypeNumbers.book) ? sourceTypeNumbers.book.length : 0) || 0);
        const bookIssueCount = Number(bookValidation.issues || 0) || Number(categoryCounts.reference_missing_place || 0) || Number(categoryCounts.reference_missing_publisher || 0) || 0;
        const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];
        const confidenceCounts = trail.reduce((acc, item) => {
            const key = String(item && item.confidence || 'needs_review');
            acc[key] = Number(acc[key] || 0) + 1;
            return acc;
        }, {});
        const enrichmentEnabled = enrichment.enabled === true;
        const doiRejected = Number(enrichment.doi_rejected || 0);
        const needsReviewCount = Number(confidenceCounts.needs_review || 0);
        const stages = [
            { name: 'Spelling check', status: 'done' },
            { name: 'Grammar check', status: 'done' },
            { name: 'Reference parsing', status: refCount > 0 ? 'done' : 'skipped' },
            { name: 'Book references', status: bookCount > 0 ? (bookIssueCount > 0 ? 'failed' : 'done') : 'skipped', meta: `books=${bookCount}${bookCount > 0 ? `, issues=${bookIssueCount}` : ''}` },
            { name: 'Reference validation', status: online.enabled === true ? (Number(onlineSummary.error || 0) > 0 ? 'failed' : 'done') : 'skipped', meta: `checked=${Number(onlineSummary.checked || 0)}` },
            { name: 'Reference auto-fill', status: enrichmentEnabled ? (doiRejected > 0 ? 'failed' : 'done') : 'skipped', meta: enrichmentEnabled ? `filled=${Number(enrichment.fields_filled || 0)}, doi_inserted=${Number(enrichment.doi_inserted || 0)}, doi_review=${Number(enrichment.doi_needs_review_inserted || 0)}, doi_rejected=${doiRejected}, mode=${String(enrichment.doi_mode || 'balanced')}` : 'disabled' },
            { name: 'Reference confidence', status: enrichmentEnabled ? (needsReviewCount > 0 ? 'failed' : (trail.length > 0 ? 'done' : 'skipped')) : 'skipped', meta: enrichmentEnabled ? `verified=${Number(confidenceCounts.verified || 0)}, likely=${Number(confidenceCounts.likely || 0)}, needs_review=${needsReviewCount}` : 'disabled' },
            { name: 'Serper validation', status: online.serper_enabled === true ? 'done' : 'skipped', meta: `enabled=${online.serper_enabled === true ? 'yes' : 'no'}` },
            { name: 'Content consistency', status: (mode === 'sectioned' || mode === 'full') ? 'done' : 'skipped' },
            { name: 'Final validation', status: fallback ? 'failed' : 'done', meta: fallback ? 'fallback used' : 'stable' },
        ];
        const rerunMeta = fileContent.rerunActionMeta && typeof fileContent.rerunActionMeta === 'object' ? fileContent.rerunActionMeta : null;
        const delta = rerunMeta && rerunMeta.delta && typeof rerunMeta.delta === 'object' ? rerunMeta.delta : null;
        if (rerunMeta && String(rerunMeta.action || '') === 'rerun_unresolved_references' && delta) {
            const regressed = Number(delta.regressed_delta || 0);
            stages.push({
                name: 'Unresolved rerun delta',
                status: regressed > 0 ? 'failed' : 'done',
                meta: `before=${Number(delta.before_unresolved || 0)}, after=${Number(delta.after_unresolved || 0)}, resolved=${Number(delta.resolved_delta || 0)}${regressed > 0 ? `, regressed=${regressed}` : ''}`,
            });
        }
        return stages;
    }

    function renderRunStagesFromState() {
        if (!dom.assistantRunStagesList) return;
        const fileContent = state.fileContent || {};
        if (!(fileContent.processingAudit || fileContent.citationReferenceReport)) {
            dom.assistantRunStagesList.textContent = 'No run data yet.';
            return;
        }
        const rows = deriveRunStagesFromState().map((stage) => {
            const meta = stage.meta ? ` (${escapeHtml(stage.meta)})` : '';
            return `<li>${escapeHtml(stage.name)}: <span class="stage-badge ${stage.status}">${stageIcon(stage.status)} ${stageStatusLabel(stage.status)}</span>${meta}</li>`;
        }).join('');
        dom.assistantRunStagesList.innerHTML = `<ul>${rows}</ul>`;
        renderAssistantQuickSummaryFromState();
        renderUnresolvedReferencesPanelFromState();
    }

    function renderAssistantQuickSummaryFromState() {
        if (!dom.assistantQuickSummary) return;
        const fileContent = state.fileContent || {};
        const audit = fileContent.processingAudit && typeof fileContent.processingAudit === 'object' ? fileContent.processingAudit : {};
        const summary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
        const citation = fileContent.citationReferenceReport && typeof fileContent.citationReferenceReport === 'object' ? fileContent.citationReferenceReport : {};
        const citationSummary = citation.summary && typeof citation.summary === 'object' ? citation.summary : {};
        const strictIssues = fileContent.strictCmosIssues && typeof fileContent.strictCmosIssues === 'object' ? fileContent.strictCmosIssues : {};
        const strictCounts = strictIssues.counts && typeof strictIssues.counts === 'object' ? strictIssues.counts : {};
        if (!fileContent.taskId) {
            dom.assistantQuickSummary.textContent = 'Open a task to view quality status and recommended next step.';
            return;
        }
        const fallbackSections = Number(summary.fallback_sections || 0);
        const totalSections = Number(summary.total_sections || 0);
        const citationIssues = Number(citationSummary.citation_issues || 0);
        const referenceIssues = Number(citationSummary.reference_issues || 0);
        let recommendation = 'Next: Ask assistant "what should I retry?" for guided settings.';
        if (fallbackSections > 0) recommendation = 'Next: Use "Retry Recommended" to reduce fallback sections.';
        if (citationIssues === 0 && referenceIssues === 0 && fallbackSections === 0) recommendation = 'Status looks healthy. You can export clean/redline output.';
        const sectionInfo = totalSections > 0 ? `AI accepted ${Number(summary.accepted_sections || 0)}/${totalSections}; fallback ${fallbackSections}/${totalSections}.` : 'Section-level acceptance data not available.';
        const strictInfo = `Strict CMOS total: ${Number(strictIssues.total || 0)} (P:${Number(strictCounts.punctuation || 0)} C:${Number(strictCounts.capitalization || 0)} S:${Number(strictCounts.style || 0)} Sp:${Number(strictCounts.spelling || 0)}).`;
        const cmos = summary.cmos_guardrails && typeof summary.cmos_guardrails === 'object' ? summary.cmos_guardrails : {};
        const qualityInfo = `CMOS: ${String(cmos.status || 'unknown')} (${Number(cmos.compliance_score || 0)}). Citation issues: ${citationIssues}. Reference issues: ${referenceIssues}.`;
        const modeInfo = audit.mode ? `Mode: ${String(audit.mode).toLowerCase()}.` : 'Mode: unknown.';
        dom.assistantQuickSummary.textContent = `${sectionInfo} ${strictInfo} ${qualityInfo} ${modeInfo} ${recommendation}`;
    }

    function classifyUnresolvedFixability(payload) {
        const signal = [
            String(payload && payload.status || ''),
            String(payload && payload.whyManualReview || ''),
            ...(Array.isArray(payload && payload.reasons) ? payload.reasons : []),
        ].join(' ').toLowerCase();
        if (signal.includes('autofill_partial') || signal.includes('doi_needs_review') || signal.includes('likely_match')) return 'auto-fixable';
        if (signal.includes('not_found') || signal.includes('error') || signal.includes('untrusted_source')) return 'needs-source';
        return 'needs-human-judgment';
    }

    function collectUnresolvedReferenceItemsFromState() {
        const fileContent = state.fileContent || {};
        const report = fileContent.citationReferenceReport && typeof fileContent.citationReferenceReport === 'object' ? fileContent.citationReferenceReport : {};
        const online = report.online_validation && typeof report.online_validation === 'object' ? report.online_validation : {};
        const enrichment = online.enrichment && typeof online.enrichment === 'object' ? online.enrichment : {};
        const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];
        const entries = Array.isArray(online.entries) ? online.entries : [];
        const byNumber = new Map();
        trail.forEach((item) => {
            const number = Number(item && item.number || 0);
            if (!number) return;
            const autofillStatus = String(item && item.autofill_status || 'none');
            const doiRejected = Boolean(item && item.doi_rejected);
            const doiNeedsReview = Boolean(item && item.doi_needs_review);
            if (!(doiRejected || doiNeedsReview || autofillStatus !== 'full')) return;
            const reasons = []
                .concat(Array.isArray(item && item.autofill_chips) ? item.autofill_chips : [])
                .concat(Array.isArray(item && item.auto_resolve_chips) ? item.auto_resolve_chips : [])
                .concat(Array.isArray(item && item.doi_reason_chips) ? item.doi_reason_chips : [])
                .map((chip) => String(chip || '').trim())
                .filter(Boolean);
            const status = doiRejected ? 'doi_rejected' : (doiNeedsReview ? 'doi_needs_review' : `autofill_${autofillStatus}`);
            const whyManualReview = String(item && item.why_manual_review || '').trim();
            byNumber.set(number, {
                number,
                severity: doiRejected ? 3 : (doiNeedsReview ? 2 : 1),
                status,
                fixability: classifyUnresolvedFixability({ status, whyManualReview, reasons }),
                whyManualReview,
                reasons,
            });
        });
        entries.forEach((item) => {
            const status = String(item && item.status || '');
            if (!['mismatch', 'not_found', 'ambiguous', 'error'].includes(status)) return;
            const number = Number(item && item.number || 0);
            if (!number) return;
            const current = byNumber.get(number) || { number, severity: 1, status, reasons: [] };
            current.severity = Math.max(Number(current.severity || 1), status === 'error' || status === 'mismatch' ? 3 : 2);
            if (item && item.reason) current.reasons.push(String(item.reason));
            current.fixability = classifyUnresolvedFixability(current);
            byNumber.set(number, current);
        });
        return Array.from(byNumber.values());
    }

    function sortUnresolvedItems(items) {
        const mode = dom.assistantUnresolvedSort ? String(dom.assistantUnresolvedSort.value || 'number_asc') : 'number_asc';
        const rows = Array.isArray(items) ? items.slice() : [];
        if (mode === 'number_desc') return rows.sort((a, b) => Number(b.number || 0) - Number(a.number || 0));
        if (mode === 'severity_desc') return rows.sort((a, b) => (Number(b.severity || 0) - Number(a.severity || 0)) || (Number(a.number || 0) - Number(b.number || 0)));
        return rows.sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
    }

    function renderUnresolvedReferencesPanelFromState() {
        if (!dom.assistantUnresolvedList) return;
        const items = sortUnresolvedItems(collectUnresolvedReferenceItemsFromState());
        if (!items.length) {
            dom.assistantUnresolvedList.textContent = 'No unresolved references yet.';
            return;
        }
        const rows = items.map((item) => {
            const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean).slice(0, 3) : [];
            const reasonText = reasons.map((reason) => `[${escapeHtml(reason)}]`).join(' ');
            const reasonChip = item.whyManualReview ? `[manual:${escapeHtml(item.whyManualReview)}]` : '';
            return `<li>[${Number(item.number || 0)}] ${escapeHtml(String(item.status || 'unresolved').replaceAll('_', ' '))} [fixability:${escapeHtml(item.fixability || 'needs-human-judgment')}] ${reasonChip} ${reasonText}</li>`;
        }).join('');
        dom.assistantUnresolvedList.innerHTML = `<ul>${rows}</ul>`;
    }

    function exportUnresolvedReferencesReport() {
        const taskId = currentTaskId();
        if (!taskId) {
            setStatus('Load a task before exporting unresolved references.', 'warning');
            return;
        }
        const items = sortUnresolvedItems(collectUnresolvedReferenceItemsFromState());
        if (!items.length) {
            setStatus('No unresolved references to export.', 'success');
            return;
        }
        const lines = ['Unresolved References Report', `Task: ${taskId}`, `Generated: ${new Date().toISOString()}`, `Count: ${items.length}`, ''];
        items.forEach((item) => {
            lines.push(`[${Number(item.number || 0)}] ${String(item.status || 'unresolved')}`);
            const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean).slice(0, 5) : [];
            if (reasons.length) lines.push(`Reasons: ${reasons.join('; ')}`);
            lines.push('');
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `unresolved_references_${taskId}.txt`;
        document.body.appendChild(link);
        link.click();
        window.setTimeout(() => {
            try { document.body.removeChild(link); } catch (err) {}
            URL.revokeObjectURL(url);
        }, 60_000);
        setStatus(`Exported unresolved report (${items.length} items)`, 'success');
    }

    function buildDiagnosticsExportText() {
        const stageLines = deriveRunStagesFromState().map((stage) => `- ${stage.name}: ${stageStatusLabel(stage.status)}${stage.meta ? ` (${stage.meta})` : ''}`);
        const fileContent = state.fileContent || {};
        const report = fileContent.citationReferenceReport && typeof fileContent.citationReferenceReport === 'object' ? fileContent.citationReferenceReport : {};
        const online = report.online_validation && typeof report.online_validation === 'object' ? report.online_validation : {};
        const enrichment = online.enrichment && typeof online.enrichment === 'object' ? online.enrichment : {};
        const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];
        const trailLines = trail.map((item) => {
            const fields = Array.isArray(item && item.fields_filled) ? item.fields_filled.join(',') : '';
            return `- [${Number(item && item.number || 0)}] ${String(item && item.source_type || 'generic')} ${String(item && item.confidence || 'needs_review')} source=${String(item && item.source || '') || 'n/a'} fields=${fields || 'none'} doi_inserted=${item && item.doi_inserted ? 'yes' : 'no'} doi_rejected=${item && item.doi_rejected ? 'yes' : 'no'}`;
        });
        const logLines = requestLogEntries.slice(-10).reverse().map((entry) => `- ${entry.action}: ${entry.status}, ${entry.latencyMs}ms, retried=${entry.retried ? 'yes' : 'no'}`);
        return [
            'Assistant Diagnostics',
            `Endpoint: ${String(dom.assistantEndpointStatus && dom.assistantEndpointStatus.textContent || 'idle')}`,
            `Last success: ${String(dom.assistantLastSuccess && dom.assistantLastSuccess.textContent || 'never')}`,
            `Last error: ${String(dom.assistantLastError && dom.assistantLastError.textContent || 'none')}`,
            '',
            'Run Stages',
            ...stageLines,
            '',
            'Reference Enrichment Trail',
            ...(trailLines.length ? trailLines : ['- No enrichment trail yet']),
            '',
            'Request Log (last 10)',
            ...(logLines.length ? logLines : ['- No requests yet']),
        ].join('\n');
    }

    function copyAssistantDiagnostics() {
        const text = buildDiagnosticsExportText();
        const fallbackCopy = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (err) {}
            try { document.body.removeChild(ta); } catch (err) {}
        };
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).catch(() => fallbackCopy());
        } else {
            fallbackCopy();
        }
        showAssistantToast('Diagnostics copied.');
    }

    function setAssistantActionsLoading(loading, label) {
        actionInFlight = loading === true;
        const controls = [
            dom.rerunUnresolvedBtn,
            dom.assistantAskBtn,
            dom.assistantReprocessBtn,
            dom.assistantApplyDecisionsBtn,
            dom.assistantRetryRecommendedBtn,
            dom.assistantRerunUnresolvedBtn,
            dom.assistantUnresolvedRerunBtn,
            dom.assistantUnresolvedRerunAutofixableBtn,
            dom.assistantGuidedRunBtn,
        ];
        Array.prototype.forEach.call(dom.assistantQuickPromptButtons || [], (button) => controls.push(button));
        controls.forEach((btn) => {
            if (!btn) return;
            if (!btn.dataset.baseLabel) btn.dataset.baseLabel = btn.textContent || '';
            btn.disabled = actionInFlight;
            btn.textContent = actionInFlight ? `${btn.dataset.baseLabel}...` : btn.dataset.baseLabel;
        });
        if (actionInFlight && label) setStatus(String(label), 'warning');
    }

    function callAssistantWithRetry(actionName, executor, onComplete) {
        let attempts = 0;
        let done = false;
        const startedAt = Date.now();
        const run = () => {
            attempts += 1;
            let timeoutId = window.setTimeout(() => {
                timeoutId = null;
                if (done) return;
                if (attempts < 2) {
                    run();
                    return;
                }
                done = true;
                pushAssistantRequestLogEntry(actionName, 'timeout', Date.now() - startedAt, attempts > 1);
                onComplete({ success: false, error: 'Request timed out' });
            }, ASSISTANT_REQUEST_TIMEOUT_MS);
            executor((response) => {
                if (done) return;
                if (timeoutId) window.clearTimeout(timeoutId);
                const errText = String((response && response.error) || '').toLowerCase();
                const transient = errText.includes('timeout') || errText.includes('temporar') || errText.includes('try again');
                if (attempts < 2 && (!response || response.success !== true) && transient) {
                    run();
                    return;
                }
                done = true;
                const finalResponse = response || { success: false, error: 'Empty response' };
                pushAssistantRequestLogEntry(actionName, finalResponse.success === true ? 'success' : 'failed', Date.now() - startedAt, attempts > 1);
                onComplete(finalResponse);
            });
        };
        run();
    }

    function toggleAssistantChat(shouldOpen) {
        if (!dom.assistantChatPanel) return;
        const open = shouldOpen === true;
        dom.assistantChatPanel.classList.toggle('hidden', !open);
        if (open) setAssistantUnreadCount(0);
    }

    function appendAssistantChatMessage(role, text) {
        if (!dom.assistantOutput) return;
        const line = `[${role === 'user' ? 'You' : 'Assistant'}] ${String(text || '').trim()}`;
        const current = String(dom.assistantOutput.textContent || '').trim();
        const next = current ? `${current}\n\n${line}` : line;
        dom.assistantOutput.textContent = next;
        dom.assistantOutput.scrollTop = dom.assistantOutput.scrollHeight;
        const store = readAssistantChatStore();
        store[getAssistantTaskKey()] = next;
        writeAssistantChatStore(store);
        const isPanelOpen = dom.assistantChatPanel && !dom.assistantChatPanel.classList.contains('hidden');
        if (role === 'assistant' && !isPanelOpen) setAssistantUnreadCount(unreadCount + 1);
    }

    function restoreAssistantChatHistoryForCurrentTask() {
        const key = getAssistantTaskKey();
        if (currentTaskKey === key) return;
        currentTaskKey = key;
        const saved = String(readAssistantChatStore()[key] || '').trim();
        if (dom.assistantOutput) dom.assistantOutput.textContent = saved || 'Assistant output appears here.';
        renderAssistantQuickSummaryFromState();
        setAssistantUnreadCount(0);
    }

    function applyProcessingModeProviderContext(provider, model) {
        if (!dom.processingModeIndicator) return;
        const safeProvider = String(provider || '').trim() || 'unknown';
        const safeModel = String(model || '').trim() || 'unknown';
        dom.processingModeIndicator.title = `Provider: ${safeProvider} | Model: ${safeModel}`;
    }

    function getProviderModelFromOptions(options) {
        const ai = options && typeof options.ai === 'object' ? options.ai : {};
        return { provider: String(ai.provider || ''), model: String(ai.model || '') };
    }

    function buildFallbackRetryOptions(baseOptions) {
        const source = baseOptions && typeof baseOptions === 'object' ? baseOptions : {};
        const next = JSON.parse(JSON.stringify(source));
        if (!next.ai || typeof next.ai !== 'object') next.ai = {};
        next.ai.enabled = true;
        next.ai.section_wise = true;
        next.ai.section_threshold_chars = Math.min(10000, Math.max(4000, Number(next.ai.section_threshold_chars || 12000) - 2000));
        next.ai.section_threshold_paragraphs = Math.min(90, Math.max(20, Number(next.ai.section_threshold_paragraphs || 90) - 15));
        next.ai.section_chunk_chars = Math.min(6000, Math.max(2200, Number(next.ai.section_chunk_chars || 5500) - 1200));
        next.ai.section_chunk_lines = Math.min(36, Math.max(16, Number(next.ai.section_chunk_lines || 28) - 4));
        next.ai.global_consistency_max_chars = Math.min(16000, Math.max(8000, Number(next.ai.global_consistency_max_chars || 18000) - 4000));
        return next;
    }

    function renderFallbackInsightsFromCurrentState() {
        if (!dom.assistantFallbackPanel) return;
        const fileContent = state.fileContent || {};
        const audit = fileContent.processingAudit && typeof fileContent.processingAudit === 'object' ? fileContent.processingAudit : {};
        const summary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
        const reasons = summary.fallback_reason_counts && typeof summary.fallback_reason_counts === 'object' ? summary.fallback_reason_counts : {};
        const reasonEntries = Object.entries(reasons).filter((entry) => Number(entry[1]) > 0);
        const fallbackSections = Number(summary.fallback_sections || 0);
        const totalSections = Number(summary.total_sections || 0);
        const acceptedSections = Number(summary.accepted_sections || 0);
        const shouldShow = String(audit.mode || '').toLowerCase() === 'rule_only' || fallbackSections > 0 || reasonEntries.length > 0;
        dom.assistantFallbackPanel.classList.toggle('hidden', !shouldShow);
        if (!shouldShow) {
            if (dom.assistantFallbackSummary) dom.assistantFallbackSummary.textContent = 'No fallback details yet.';
            if (dom.assistantFallbackReasons) dom.assistantFallbackReasons.innerHTML = '';
            if (dom.assistantFallbackRecommendations) dom.assistantFallbackRecommendations.innerHTML = '';
            return;
        }
        if (dom.assistantFallbackSummary) {
            dom.assistantFallbackSummary.textContent = `Fallback sections: ${totalSections > 0 ? `${fallbackSections}/${totalSections}` : String(fallbackSections)}. Accepted sections: ${acceptedSections}.`;
        }
        if (dom.assistantFallbackReasons) {
            if (reasonEntries.length) {
                const list = reasonEntries.slice(0, 6).map(([reason, count]) => `<li>${escapeHtml(reason)}: ${Number(count)}</li>`).join('');
                dom.assistantFallbackReasons.innerHTML = `<div><strong>Top reasons</strong></div><ul>${list}</ul>`;
            } else {
                dom.assistantFallbackReasons.innerHTML = '<div><strong>Top reasons</strong>: not available for this run.</div>';
            }
        }
        if (dom.assistantFallbackRecommendations) {
            const cmos = summary.cmos_guardrails && typeof summary.cmos_guardrails === 'object' ? summary.cmos_guardrails : {};
            const recs = Array.isArray(cmos.recommendations) ? cmos.recommendations : [];
            if (recs.length) {
                dom.assistantFallbackRecommendations.innerHTML = `<div><strong>Recommended next steps</strong></div><ul>${recs.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
            } else {
                dom.assistantFallbackRecommendations.innerHTML = '<div><strong>Recommended next steps</strong>: Use retry with recommended settings.</div>';
            }
        }
    }

    function renderAssistantSuggestions(suggestions) {
        if (!dom.assistantSuggestions) return;
        const items = Array.isArray(suggestions) ? suggestions : [];
        if (!items.length) {
            dom.assistantSuggestions.innerHTML = '';
            return;
        }
        dom.assistantSuggestions.innerHTML = `<ul>${items.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    }

    function getAssistantQuickPromptMessage(promptKey) {
        const prompts = {
            next_step: 'What should I do next for this task? Use the current diagnostics and suggest the safest action.',
            quality: 'Summarize the current spelling, grammar, CMOS, citation, and reference status for this task.',
            fallback: 'Why did this task use fallback, and what settings should I retry with?',
            references: 'Show unresolved citation and reference issues, then tell me the safest way to fix them.',
            export: 'Is this task ready to export? List any checks that still block clean or redline export.'
        };
        return prompts[String(promptKey || '').trim().toLowerCase()] || prompts.next_step;
    }

    function askAssistantQuickPrompt(promptKey) {
        if (actionInFlight) return;
        const message = getAssistantQuickPromptMessage(promptKey);
        if (dom.assistantQuestionInput) {
            dom.assistantQuestionInput.value = message;
            dom.assistantQuestionInput.focus();
        }
        askAssistantQuestion();
    }

    function askAssistantQuestion() {
        if (actionInFlight) return;
        const taskId = currentTaskId();
        const message = dom.assistantQuestionInput ? String(dom.assistantQuestionInput.value || '').trim() : '';
        const includeAdminActivity = !!(dom.assistantIncludeAdminActivityInput && dom.assistantIncludeAdminActivityInput.checked);
        if (!taskId && !message) {
            setStatus('Select a task or enter a question for assistant diagnostics.', 'warning');
            return;
        }
        toggleAssistantChat(true);
        if (message) appendAssistantChatMessage('user', message);
        appendAssistantChatMessage('assistant', 'Preparing diagnostics...');
        setAssistantActionsLoading(true, 'Assistant request in progress...');
        callAssistantWithRetry('ask', (done) => {
            const called = callApiOrEel(
                (api) => api.assistant && typeof api.assistant.query === 'function' ? api.assistant.query({ task_id: taskId, message, include_admin_activity: includeAdminActivity }) : null,
                'assistant_query',
                [{ task_id: taskId, message, include_admin_activity: includeAdminActivity }],
                done
            );
            if (!called) done({ success: false, error: 'Assistant endpoint unavailable' });
        }, (response) => {
            setAssistantActionsLoading(false);
            if (!(response && response.success)) {
                const errorMessage = response && response.error ? String(response.error) : 'Request failed';
                setStatus('Assistant query failed', 'error');
                setAssistantUnavailable(true, errorMessage);
                updateAssistantDiagnostics('failed', errorMessage, 0);
                appendAssistantChatMessage('assistant', `Error: ${errorMessage}`);
                renderAssistantSuggestions([]);
                return;
            }
            setAssistantUnavailable(false);
            updateAssistantDiagnostics('ok', 'none', Date.now());
            const assistant = response.assistant || {};
            appendAssistantChatMessage('assistant', String(assistant.message || 'No assistant response available.'));
            renderAssistantSuggestions(assistant.suggestions || []);
            setStatus('Assistant diagnostics ready', 'success');
            showAssistantToast('Assistant replied.');
        });
    }

    function ensureTaskForGuidedAction(actionKey) {
        if (currentTaskId()) return true;
        setStatus('Load a task before running this assistant action.', 'warning');
        toggleAssistantChat(true);
        appendAssistantChatMessage('assistant', `Open a task first, then choose ${String(actionKey || 'an assistant action')}.`);
        return false;
    }

    function getGuidedActionConfig(actionKey) {
        const configs = {
            reprocess: {
                title: 'Reprocess current task',
                summary: 'Runs the current manuscript through the processing pipeline again using your active settings.',
                bullets: ['Replaces the corrected output for this task.', 'Keeps the uploaded source task intact.', 'Best when settings changed or output looks stale.'],
                runLabel: 'Run Reprocess',
                execute: assistantReprocessCurrentTask,
            },
            apply_decisions: {
                title: 'Apply correction decisions',
                summary: 'Applies your current accept/reject choices for correction groups to the task output.',
                bullets: ['Updates the corrected preview and export source.', 'Uses the current group decisions visible in the corrections panel.', 'Best after reviewing spelling, punctuation, citation, reference, and style groups.'],
                runLabel: 'Apply Decisions',
                execute: assistantApplyCurrentDecisions,
            },
            retry_recommended: {
                title: 'Retry with recommended settings',
                summary: 'Retries with safer section-wise AI settings to reduce fallback sections.',
                bullets: ['May replace the corrected output with a stronger AI-assisted result.', 'Keeps section chunks smaller to reduce incomplete AI output.', 'Best when fallback sections are present.'],
                runLabel: 'Run Recommended Retry',
                execute: retryWithRecommendedSettings,
            },
            rerun_unresolved: {
                title: 'Rerun unresolved references',
                summary: 'Runs a references-only cleanup pass for unresolved reference items.',
                bullets: ['Disables broad AI editing and focuses on reference cleanup.', 'Updates reference diagnostics and corrected output.', 'Best when unresolved references remain after normal processing.'],
                runLabel: 'Rerun Unresolved',
                execute: rerunUnresolvedReferencesOnly,
            },
            rerun_auto_fixable: {
                title: 'Retry auto-fixable references only',
                summary: 'Runs a narrower references-only pass for entries marked as likely auto-fixable.',
                bullets: ['Skips broader manuscript rewriting.', 'Targets references with likely DOI/source matches or partial autofill.', 'Best before exporting an unresolved report for human review.'],
                runLabel: 'Retry Auto-Fixable',
                execute: rerunAutoFixableReferencesOnly,
            },
        };
        return configs[String(actionKey || '').trim()] || null;
    }

    function hideAssistantGuidedActionCard() {
        pendingGuidedAction = '';
        if (dom.assistantGuidedActionCard) dom.assistantGuidedActionCard.classList.add('hidden');
    }

    function prepareAssistantGuidedAction(actionKey) {
        const config = getGuidedActionConfig(actionKey);
        if (!config || actionInFlight) return;
        if (!ensureTaskForGuidedAction(actionKey)) return;
        pendingGuidedAction = String(actionKey || '').trim();
        toggleAssistantChat(true);
        if (dom.assistantGuidedActionTitle) dom.assistantGuidedActionTitle.textContent = config.title;
        if (dom.assistantGuidedActionSummary) dom.assistantGuidedActionSummary.textContent = config.summary;
        if (dom.assistantGuidedActionDetails) {
            dom.assistantGuidedActionDetails.innerHTML = `<ul>${config.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
        }
        if (dom.assistantGuidedRunBtn) {
            dom.assistantGuidedRunBtn.textContent = config.runLabel;
            dom.assistantGuidedRunBtn.dataset.baseLabel = config.runLabel;
        }
        if (dom.assistantGuidedActionCard) dom.assistantGuidedActionCard.classList.remove('hidden');
        appendAssistantChatMessage('assistant', `Review action card: ${config.title}.`);
    }

    function runPreparedAssistantGuidedAction() {
        const config = getGuidedActionConfig(pendingGuidedAction);
        hideAssistantGuidedActionCard();
        if (config && typeof config.execute === 'function') config.execute();
    }

    function assistantReprocessCurrentTask() {
        if (actionInFlight) return;
        const taskId = currentTaskId();
        if (!taskId) {
            setStatus('Load a task before assistant reprocess.', 'warning');
            return;
        }
        const options = auth.buildProcessingOptionsFromRuntimeSettings();
        const reprocessProviderModel = getProviderModelFromOptions(options);
        toggleAssistantChat(true);
        appendAssistantChatMessage('assistant', 'Reprocessing current task...');
        setAssistantActionsLoading(true, 'Assistant is reprocessing current task...');
        callAssistantWithRetry('reprocess', (done) => {
            const called = callApiOrEel(
                (api) => api.assistant && typeof api.assistant.reprocessTask === 'function' ? api.assistant.reprocessTask(taskId, options) : null,
                'assistant_reprocess_task',
                [taskId, options],
                done
            );
            if (!called) done({ success: false, error: 'Assistant endpoint unavailable' });
        }, (response) => {
            setAssistantActionsLoading(false);
            if (!(response && response.success && response.result && response.result.success)) {
                const errorMessage = response && response.error ? String(response.error) : 'Request failed';
                setStatus('Assistant reprocess failed', 'error');
                setAssistantUnavailable(true, errorMessage);
                updateAssistantDiagnostics('failed', errorMessage, 0);
                appendAssistantChatMessage('assistant', `Reprocess failed: ${errorMessage}`);
                alert('Assistant reprocess error: ' + errorMessage);
                return;
            }
            setAssistantUnavailable(false);
            updateAssistantDiagnostics('ok', 'none', Date.now());
            applyProcessResponseToState(response.result, { keepGroupDecisions: false });
            applyProcessingModeProviderContext(reprocessProviderModel.provider, reprocessProviderModel.model);
            appendAssistantChatMessage('assistant', 'Reprocess complete.');
            switchTab('corrected');
            auth.refreshTaskHistory();
            setStatus('Assistant reprocess complete', 'success');
            showAssistantToast('Assistant reprocess completed.');
        });
    }

    function assistantApplyCurrentDecisions() {
        if (actionInFlight) return;
        const taskId = currentTaskId();
        if (!taskId) {
            setStatus('Load a task before assistant decision apply.', 'warning');
            return;
        }
        const groupDecisions = preview.normalizeGroupDecisions(state.fileContent.groupDecisions);
        const currentProcessingOptions = auth.buildProcessingOptionsFromRuntimeSettings();
        const decisionProviderModel = getProviderModelFromOptions(currentProcessingOptions);
        toggleAssistantChat(true);
        appendAssistantChatMessage('assistant', 'Applying current correction decisions...');
        setAssistantActionsLoading(true, 'Assistant is applying correction decisions...');
        callAssistantWithRetry('apply_decisions', (done) => {
            const called = callApiOrEel(
                (api) => api.assistant && typeof api.assistant.applyGroupDecisions === 'function' ? api.assistant.applyGroupDecisions(taskId, groupDecisions, state.fileContent.fullCorrectedText || state.fileContent.corrected || '') : null,
                'assistant_apply_group_decisions',
                [taskId, groupDecisions, state.fileContent.fullCorrectedText || state.fileContent.corrected || ''],
                done
            );
            if (!called) done({ success: false, error: 'Assistant endpoint unavailable' });
        }, (response) => {
            setAssistantActionsLoading(false);
            if (!(response && response.success && response.result && response.result.success)) {
                const errorMessage = response && response.error ? String(response.error) : 'Request failed';
                setStatus('Assistant decision apply failed', 'error');
                setAssistantUnavailable(true, errorMessage);
                updateAssistantDiagnostics('failed', errorMessage, 0);
                appendAssistantChatMessage('assistant', `Apply decisions failed: ${errorMessage}`);
                alert('Assistant decision apply error: ' + errorMessage);
                return;
            }
            setAssistantUnavailable(false);
            updateAssistantDiagnostics('ok', 'none', Date.now());
            applyProcessResponseToState(response.result, { keepGroupDecisions: true });
            applyProcessingModeProviderContext(decisionProviderModel.provider, decisionProviderModel.model);
            appendAssistantChatMessage('assistant', 'Decisions applied successfully.');
            preview.renderCurrentPreview();
            auth.refreshTaskHistory();
            setStatus('Assistant applied correction decisions', 'success');
            showAssistantToast('Assistant applied decisions.');
        });
    }

    function retryWithRecommendedSettings() {
        if (actionInFlight) return;
        const taskId = currentTaskId();
        if (!taskId) {
            setStatus('Load a task before retrying with recommended settings.', 'warning');
            return;
        }
        const retryOptions = buildFallbackRetryOptions(auth.buildProcessingOptionsFromRuntimeSettings());
        const providerModel = getProviderModelFromOptions(retryOptions);
        toggleAssistantChat(true);
        appendAssistantChatMessage('assistant', 'Retrying with recommended settings...');
        setAssistantActionsLoading(true, 'Retrying with recommended settings...');
        callAssistantWithRetry('retry_recommended', (done) => {
            const called = callApiOrEel(
                (api) => api.assistant && typeof api.assistant.reprocessTask === 'function' ? api.assistant.reprocessTask(taskId, retryOptions) : null,
                'assistant_reprocess_task',
                [taskId, retryOptions],
                done
            );
            if (!called) done({ success: false, error: 'Assistant endpoint unavailable' });
        }, (response) => {
            setAssistantActionsLoading(false);
            if (!(response && response.success && response.result && response.result.success)) {
                const errorMessage = response && response.error ? String(response.error) : 'Request failed';
                setAssistantUnavailable(true, errorMessage);
                updateAssistantDiagnostics('failed', errorMessage, 0);
                appendAssistantChatMessage('assistant', `Recommended retry failed: ${errorMessage}`);
                setStatus('Recommended retry failed', 'error');
                alert('Recommended retry error: ' + errorMessage);
                return;
            }
            setAssistantUnavailable(false);
            updateAssistantDiagnostics('ok', 'none', Date.now());
            applyProcessResponseToState(response.result, { keepGroupDecisions: false });
            applyProcessingModeProviderContext(providerModel.provider, providerModel.model);
            appendAssistantChatMessage('assistant', 'Recommended retry complete.');
            switchTab('corrected');
            auth.refreshTaskHistory();
            setStatus('Recommended retry complete', 'success');
            showAssistantToast('Recommended retry completed.');
        });
    }

    function rerunUnresolvedReferencesOnly() {
        runUnresolvedReferencesWithMode('all');
    }

    function rerunAutoFixableReferencesOnly() {
        runUnresolvedReferencesWithMode('auto_fixable');
    }

    function runUnresolvedReferencesWithMode(filterMode) {
        if (actionInFlight) {
            setStatus('Another assistant action is already running. Please wait a moment.', 'warning');
            return;
        }
        const taskId = currentTaskId();
        if (!taskId) {
            setStatus('Load a task before rerunning unresolved references.', 'warning');
            toggleAssistantChat(true);
            appendAssistantChatMessage('assistant', 'Please open a task first, then run unresolved references rerun.');
            return;
        }
        const baseOptions = auth.buildProcessingOptionsFromRuntimeSettings();
        const retryOptions = Object.assign({}, baseOptions, {
            unresolved_reference_only: true,
            unresolved_fixability_filter: String(filterMode || 'all'),
            spelling: false,
            sentence_case: false,
            punctuation: false,
            chicago_style: true
        });
        const aiOptions = baseOptions && baseOptions.ai && typeof baseOptions.ai === 'object' ? Object.assign({}, baseOptions.ai) : {};
        aiOptions.enabled = false;
        retryOptions.ai = aiOptions;
        const providerModel = getProviderModelFromOptions(retryOptions);
        const beforeReportSnapshot = state.fileContent.citationReferenceReport && typeof state.fileContent.citationReferenceReport === 'object' ? state.fileContent.citationReferenceReport : {};
        const modeLabel = String(filterMode || 'all') === 'auto_fixable' ? 'auto-fixable unresolved references' : 'unresolved references';
        toggleAssistantChat(true);
        appendAssistantChatMessage('assistant', `Rerunning ${modeLabel}...`);
        setAssistantActionsLoading(true, `Rerunning ${modeLabel}...`);
        const finish = (response, rerunPath) => {
            setAssistantActionsLoading(false);
            if (!(response && response.success && response.result && response.result.success)) {
                const errorMessage = response && response.error ? String(response.error) : 'Request failed';
                setAssistantUnavailable(true, errorMessage);
                updateAssistantDiagnostics('failed', errorMessage, 0);
                appendAssistantChatMessage('assistant', `Unresolved references rerun failed: ${errorMessage}`);
                setStatus('Unresolved references rerun failed', 'error');
                alert('Unresolved references rerun error: ' + errorMessage);
                return;
            }
            setAssistantUnavailable(false);
            updateAssistantDiagnostics('ok', 'none', Date.now());
            const delta = buildUnresolvedRerunDelta(beforeReportSnapshot, response.result.citation_reference_report || {});
            applyProcessResponseToState(response.result, {
                keepGroupDecisions: false,
                rerunActionMeta: {
                    action: String(filterMode || 'all') === 'auto_fixable' ? 'rerun_auto_fixable_unresolved_references' : 'rerun_unresolved_references',
                    path: String(rerunPath || 'unknown'),
                    label: rerunPath === 'assistant_endpoint' ? 'Used assistant endpoint' : (rerunPath === 'direct_process_fallback' ? 'Used direct fallback' : 'Used unknown path'),
                    delta,
                    at: Date.now()
                }
            });
            applyProcessingModeProviderContext(providerModel.provider, providerModel.model);
            appendAssistantChatMessage('assistant', `Unresolved references rerun complete. Before: ${delta.before_unresolved}, After: ${delta.after_unresolved}, Resolved: ${delta.resolved_delta}${delta.regressed_delta > 0 ? `, Regressed: ${delta.regressed_delta}` : ''}. Mode: ${modeLabel}.`);
            switchTab('corrected');
            auth.refreshTaskHistory();
            setStatus(`Rerun complete (${modeLabel}) (${delta.before_unresolved} -> ${delta.after_unresolved})`, 'success');
            showAssistantToast('Unresolved references rerun completed.');
        };
        callAssistantWithRetry('rerun_unresolved_references', (done) => {
            const called = callApiOrEel(
                (client) => client.assistant && typeof client.assistant.reprocessTask === 'function' ? client.assistant.reprocessTask(taskId, retryOptions) : null,
                'assistant_reprocess_task',
                [taskId, retryOptions],
                done
            );
            if (!called) done({ success: false, error: 'Assistant endpoint unavailable' });
        }, (response) => {
            if (response && response.success) {
                finish(response, 'assistant_endpoint');
                return;
            }
            appendAssistantChatMessage('assistant', 'Assistant action endpoint is unavailable, using direct process fallback.');
            callAssistantWithRetry('rerun_unresolved_references_fallback', (done) => {
                const called = callApiOrEel(
                    (api) => api.tasks && typeof api.tasks.process === 'function' ? api.tasks.process(taskId, retryOptions) : null,
                    'process_document',
                    [retryOptions, taskId],
                    (fallbackResponse) => {
                        if (fallbackResponse && fallbackResponse.success) {
                            done({ success: true, result: fallbackResponse });
                            return;
                        }
                        done({ success: false, error: fallbackResponse && fallbackResponse.error ? String(fallbackResponse.error) : 'Fallback processing failed' });
                    }
                );
                if (!called) done({ success: false, error: 'Fallback processing endpoint unavailable' });
            }, (fallbackResponse) => finish(fallbackResponse, 'direct_process_fallback'));
        });
    }

    const assistantActions = {
        showAssistantToast,
        askAssistantQuestion,
        askAssistantQuickPrompt,
        prepareAssistantGuidedAction,
        runPreparedAssistantGuidedAction,
        hideAssistantGuidedActionCard,
        assistantReprocessCurrentTask,
        assistantApplyCurrentDecisions,
        retryWithRecommendedSettings,
        rerunUnresolvedReferencesOnly,
        rerunAutoFixableReferencesOnly,
        copyAssistantDiagnostics,
        exportUnresolvedReferencesReport,
        toggleAssistantChat,
        updateAssistantRouteHint,
        updateAssistantDiagnostics,
        setAssistantUnreadCount,
        renderAssistantRequestLog,
        restoreAssistantChatHistoryForCurrentTask,
        renderRunStagesFromState,
        renderUnresolvedReferencesPanelFromState,
        renderFallbackInsightsFromCurrentState,
        renderAssistantSuggestions,
        applyProcessingModeProviderContext,
        buildUnresolvedRerunDelta,
    };

    app.assistant = assistantActions;
    app.actions = Object.assign({}, app.actions || {}, assistantActions);
}());

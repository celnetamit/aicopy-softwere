const appMain = window.ManuscriptEditorApp;
const mainState = appMain.state;
const mainDom = appMain.dom;
const mainAuth = appMain.authAdmin;
const mainPreview = appMain.preview;
const mainSettings = appMain.settings;
const mainFactories = appMain.factories;
const mainConstants = appMain.constants;
const ASSISTANT_CHAT_HISTORY_KEY = 'manuscript_editor_assistant_chat_v1';
let assistantToastTimeoutId = null;
let assistantUnreadCount = 0;
let assistantCurrentTaskKey = '';
let assistantActionInFlight = false;
const ASSISTANT_REQUEST_TIMEOUT_MS = 15000;
const assistantRequestLogEntries = [];

function setStatus(message, type) {
    const statusEl = document.getElementById('status');
    const footerStatusEl = document.getElementById('footer-status');
    if (statusEl) statusEl.textContent = message;
    if (footerStatusEl) footerStatusEl.textContent = message;
    const colors = {
        info: '#a0a0a0',
        success: '#4ecca3',
        warning: '#ffc107',
        error: '#e94560'
    };
    if (statusEl) statusEl.style.color = colors[type] || colors.info;
}

function refreshProcessButtonState() {
    const canProcess = !(mainState.isFileLoading || mainState.isProcessingDocument || !String(mainState.fileContent.original || '').trim());
    if (mainDom.processBtn) {
        mainDom.processBtn.disabled = !canProcess;
    }
    if (mainDom.rerunUnresolvedBtn) {
        const hasTask = !!String(mainState.fileContent.taskId || '').trim();
        mainDom.rerunUnresolvedBtn.disabled = mainState.isFileLoading || mainState.isProcessingDocument || !hasTask;
    }
}

function setProgress(progress) {
    const progressFill = document.getElementById('progress-fill');
    if (progressFill) {
        progressFill.style.width = progress + '%';
    }
}

function formatProcessingDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function setProcessingPresenceVisible(visible) {
    if (!mainDom.processingPresence) {
        return;
    }
    mainDom.processingPresence.classList.toggle('hidden', !visible);
    if (mainDom.progressBar) {
        mainDom.progressBar.classList.toggle('processing', !!visible);
    }
}

function updateProcessingTimer() {
    if (!mainDom.processingTimer) {
        return;
    }
    if (!mainState.processingStartedAt) {
        mainDom.processingTimer.textContent = '00:00';
        return;
    }
    const elapsedSeconds = Math.floor((Date.now() - mainState.processingStartedAt) / 1000);
    mainDom.processingTimer.textContent = formatProcessingDuration(elapsedSeconds);
}

function startProcessingPresence() {
    stopProcessingPresence();
    mainState.processingStartedAt = Date.now();
    mainState.processingMessageIndex = 0;
    setProcessingPresenceVisible(true);
    if (mainDom.processingMessage) {
        mainDom.processingMessage.textContent = mainConstants.PROCESSING_MESSAGES[0];
    }
    updateProcessingTimer();
    mainState.processingTimerIntervalId = window.setInterval(updateProcessingTimer, 1000);
    mainState.processingMessageIntervalId = window.setInterval(() => {
        mainState.processingMessageIndex = (mainState.processingMessageIndex + 1) % mainConstants.PROCESSING_MESSAGES.length;
        if (mainDom.processingMessage) {
            mainDom.processingMessage.textContent = mainConstants.PROCESSING_MESSAGES[mainState.processingMessageIndex];
        }
        const elapsedSeconds = Math.floor((Date.now() - mainState.processingStartedAt) / 1000);
        const gentleProgress = Math.min(92, 30 + (elapsedSeconds * 2.2));
        setProgress(gentleProgress);
    }, 2400);
}

function stopProcessingPresence() {
    if (mainState.processingTimerIntervalId) {
        window.clearInterval(mainState.processingTimerIntervalId);
        mainState.processingTimerIntervalId = null;
    }
    if (mainState.processingMessageIntervalId) {
        window.clearInterval(mainState.processingMessageIntervalId);
        mainState.processingMessageIntervalId = null;
    }
    mainState.processingStartedAt = 0;
    mainState.processingMessageIndex = 0;
    if (mainDom.processingMessage) {
        mainDom.processingMessage.textContent = mainConstants.PROCESSING_MESSAGES[0];
    }
    if (mainDom.processingTimer) {
        mainDom.processingTimer.textContent = '00:00';
    }
    setProcessingPresenceVisible(false);
}

function clearServerTaskTracking() {
    mainState.trackedProcessingTaskId = '';
    mainState.taskRecoveryStartedAt = 0;
    mainState.taskRecoveryPollCount = 0;
}

function getTaskRecoveryPollDelay(elapsedMs) {
    if (elapsedMs < 15_000) {
        return mainConstants.TASK_RECOVERY_FAST_POLL_MS;
    }
    if (elapsedMs < 90_000) {
        return mainConstants.TASK_RECOVERY_MEDIUM_POLL_MS;
    }
    return mainConstants.TASK_RECOVERY_SLOW_POLL_MS;
}

function buildTaskRecoveryStatus(status, elapsedMs) {
    const elapsedText = formatProcessingDuration(Math.floor(elapsedMs / 1000));
    const normalized = String(status || '').toUpperCase();
    if (elapsedMs >= mainConstants.TASK_RECOVERY_SOFT_TIMEOUT_MS) {
        return `Still processing on server (${elapsedText}). We are tracking it automatically.`;
    }
    if (normalized === 'UPLOADED') {
        return `Upload finished. Waiting for server processing to continue... (${elapsedText})`;
    }
    return `Processing on server... (${elapsedText})`;
}

function scheduleTaskRecoveryPoll(taskId) {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId || mainState.trackedProcessingTaskId !== safeTaskId) {
        return;
    }
    const startedAt = mainState.taskRecoveryStartedAt || Date.now();
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    const delay = getTaskRecoveryPollDelay(elapsedMs);
    window.setTimeout(() => {
        if (mainState.trackedProcessingTaskId === safeTaskId) {
            pollTaskUntilProcessed(safeTaskId);
        }
    }, delay);
}

function startServerTaskTracking(taskId, message) {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) {
        return;
    }
    mainState.trackedProcessingTaskId = safeTaskId;
    if (!mainState.taskRecoveryStartedAt) {
        mainState.taskRecoveryStartedAt = Date.now();
    }
    if (!mainState.processingStartedAt) {
        startProcessingPresence();
    }
    if (message) {
        setStatus(message, 'warning');
    }
    pollTaskUntilProcessed(safeTaskId);
}

function handleLoadResponse(displayName) {
    return function (response) {
        mainState.isFileLoading = false;
        if (response.success) {
            mainState.fileContent.taskId = String(response.task_id || '');
            if (!mainState.fileContent.sourceType) mainState.fileContent.sourceType = 'text';
            if (String(displayName || '').toLowerCase().endsWith('.txt')) {
                mainState.fileContent.sourceType = 'text';
                mainState.fileContent.sourceDocxBase64 = '';
            }
            mainState.fileContent.original = response.text;
            mainState.fileContent.fileName = displayName;
            mainState.fileContent.corrected = '';
            mainState.fileContent.fullCorrectedText = '';
            mainState.fileContent.correctedAnnotatedHtml = '';
            mainState.fileContent.redline = '';
            mainState.fileContent.corrections = null;
            mainState.fileContent.nounReport = null;
            mainState.fileContent.domainReport = null;
            mainState.fileContent.journalProfileReport = null;
            mainState.fileContent.citationReferenceReport = null;
            mainState.fileContent.rerunActionMeta = null;
            mainState.fileContent.groupDecisions = null;
            mainState.fileContent.processingAudit = null;
            appMain.syncWindowFileContent();
            const fileNameEl = document.getElementById('file-name');
            const wordCountEl = document.getElementById('word-count');
            if (fileNameEl) fileNameEl.textContent = displayName;
            if (wordCountEl) wordCountEl.textContent = 'Words: ' + response.word_count;
            switch_tab('original');
            if (mainDom.saveCleanBtn) mainDom.saveCleanBtn.disabled = true;
            if (mainDom.saveHighlightBtn) mainDom.saveHighlightBtn.disabled = true;
            refreshProcessButtonState();
            setStatus('File loaded successfully', 'success');
            mainAuth.refreshTaskHistory();
            if (String(response.task_id || '').trim() && (!mainAuth.isTaskDetailRoute() || mainAuth.getCurrentTaskRouteId() !== String(response.task_id || '').trim())) {
                mainAuth.navigateToTask(response.task_id);
                return;
            }
            if (mainState.pendingProcessAfterLoad) {
                mainState.pendingProcessAfterLoad = false;
                window.setTimeout(() => process_document(), 0);
            }
        } else {
            mainState.pendingProcessAfterLoad = false;
            refreshProcessButtonState();
            setStatus('Error loading file', 'error');
            alert('Error loading file: ' + response.error);
        }
    };
}

function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'txt' && ext !== 'docx') {
        alert('Please select a .txt or .docx file');
        return;
    }
    setStatus('Loading file...', 'warning');
    mainState.isFileLoading = true;
    mainState.pendingProcessAfterLoad = false;
    refreshProcessButtonState();

    if (ext === 'txt') {
        const reader = new FileReader();
        reader.onload = function () {
            eel.load_text_content(file.name, reader.result)(handleLoadResponse(file.name));
        };
        reader.onerror = function () {
            mainState.isFileLoading = false;
            refreshProcessButtonState();
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
        mainState.fileContent.sourceType = 'docx';
        mainState.fileContent.sourceDocxBase64 = btoa(binary);
        appMain.syncWindowFileContent();
        eel.load_docx_content(file.name, mainState.fileContent.sourceDocxBase64)(handleLoadResponse(file.name));
    };
    reader.onerror = function () {
        mainState.isFileLoading = false;
        refreshProcessButtonState();
        setStatus('Error loading file', 'error');
        alert('Error reading .docx file');
    };
    reader.readAsArrayBuffer(file);
}

function switch_tab(tab) {
    mainState.currentTab = tab;
    document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    if (tab === 'redline' && !mainState.fileContent.redline && mainState.fileContent.corrected && typeof eel !== 'undefined' && typeof eel.get_redline_preview === 'function') {
        try {
            eel.get_redline_preview(mainState.fileContent.taskId || '')(function (response) {
                if (response && response.success) {
                    mainState.fileContent.redline = response.redline_html || '';
                    appMain.syncWindowFileContent();
                }
                if (mainState.currentTab === 'redline') mainPreview.renderCurrentPreview();
            });
        } catch (err) {
            mainPreview.renderCurrentPreview();
        }
        mainPreview.renderCurrentPreview();
        return;
    }
    mainPreview.renderCurrentPreview();
}

function switch_view(mode) {
    if (!['rich', 'plain', 'page', 'compare'].includes(mode)) {
        return;
    }
    mainState.currentViewMode = mode;
    mainDom.pageControls.classList.toggle('hidden', mode !== 'page');
    document.querySelectorAll('.view-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    mainPreview.renderCurrentPreview();
}

function applyProcessResponseToState(response, options = {}) {
    const keepGroupDecisions = options.keepGroupDecisions === true;
    mainState.fileContent.taskId = String(response.task_id || mainState.fileContent.taskId || '');
    mainState.fileContent.corrected = response.text;
    mainState.fileContent.original = response.original;
    mainState.fileContent.fullCorrectedText = response.full_corrected_text || response.text || '';
    mainState.fileContent.correctedAnnotatedHtml = response.corrected_annotated_html || '';
    mainState.fileContent.redline = response.redline_html || '';
    mainState.fileContent.proseOnlyDiff = response.prose_only_diff || '';
    mainState.fileContent.strictCmosIssues = response.strict_cmos_issues || null;
    mainState.fileContent.corrections = response.corrections_report || null;
    mainState.fileContent.nounReport = response.noun_report || null;
    mainState.fileContent.domainReport = response.domain_report || null;
    mainState.fileContent.journalProfileReport = response.journal_profile_report || null;
    mainState.fileContent.citationReferenceReport = response.citation_reference_report || null;
    mainState.fileContent.rerunActionMeta = options.rerunActionMeta && typeof options.rerunActionMeta === 'object'
        ? Object.assign({}, options.rerunActionMeta)
        : null;
    mainState.fileContent.processingAudit = response.processing_audit || null;
    mainState.fileContent.groupDecisions = keepGroupDecisions
        ? mainPreview.normalizeGroupDecisions(mainState.fileContent.groupDecisions)
        : mainPreview.buildDefaultGroupDecisions();
    appMain.syncWindowFileContent();
    restoreAssistantChatHistoryForCurrentTask();
    updateProcessingModeIndicatorFromPayload(response);
    renderRunStagesFromState();
    renderFallbackInsightsFromCurrentState();
}

function updateAssistantRouteHint() {
    if (!mainDom.assistantDashboardHint) return;
    const isDashboard = !!(mainAuth && typeof mainAuth.isTasksDashboardRoute === 'function' && mainAuth.isTasksDashboardRoute());
    mainDom.assistantDashboardHint.classList.toggle('hidden', !isDashboard);
}

function setAssistantUnavailable(visible, detailMessage) {
    if (!mainDom.assistantUnavailableBanner) return;
    const show = visible === true;
    mainDom.assistantUnavailableBanner.classList.toggle('hidden', !show);
    if (show && detailMessage) {
        mainDom.assistantUnavailableBanner.textContent = `Assistant unavailable: ${String(detailMessage)}`;
    } else if (show) {
        mainDom.assistantUnavailableBanner.textContent = 'Assistant unavailable right now. Please retry in a moment.';
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
    if (mainDom.assistantEndpointStatus) {
        mainDom.assistantEndpointStatus.textContent = String(status || 'idle');
    }
    if (mainDom.assistantLastError) {
        mainDom.assistantLastError.textContent = String(errorMessage || 'none');
    }
    if (mainDom.assistantLastSuccess) {
        mainDom.assistantLastSuccess.textContent = formatDiagnosticsTimestamp(successAt);
    }
}

function getAssistantTaskKey() {
    return String(mainState.fileContent.taskId || 'global').trim() || 'global';
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
    } catch (err) {
        // ignore storage errors
    }
}

function setAssistantUnreadCount(count) {
    assistantUnreadCount = Math.max(0, Number(count || 0));
    if (!mainDom.assistantUnreadBadge) return;
    mainDom.assistantUnreadBadge.classList.toggle('hidden', assistantUnreadCount <= 0);
    mainDom.assistantUnreadBadge.textContent = String(Math.min(99, assistantUnreadCount));
}

function showAssistantToast(message) {
    if (!mainDom.assistantToast) return;
    mainDom.assistantToast.textContent = String(message || '');
    mainDom.assistantToast.classList.remove('hidden');
    if (assistantToastTimeoutId) {
        window.clearTimeout(assistantToastTimeoutId);
        assistantToastTimeoutId = null;
    }
    assistantToastTimeoutId = window.setTimeout(() => {
        if (mainDom.assistantToast) mainDom.assistantToast.classList.add('hidden');
        assistantToastTimeoutId = null;
    }, 3200);
}

function renderAssistantRequestLog() {
    if (!mainDom.assistantRequestLogList) return;
    if (!assistantRequestLogEntries.length) {
        mainDom.assistantRequestLogList.textContent = 'No requests yet.';
        return;
    }
    const rows = assistantRequestLogEntries
        .slice(-10)
        .reverse()
        .map((entry) => {
            const retried = entry.retried ? 'yes' : 'no';
            const ms = Number(entry.latencyMs || 0);
            const statusRaw = String(entry.status || 'unknown');
            const status = appMain.helpers.escapeHtml(statusRaw);
            const action = appMain.helpers.escapeHtml(String(entry.action || 'assistant'));
            return `<li>${action}: <span class="stage-badge ${statusRaw === 'success' ? 'done' : (statusRaw === 'timeout' ? 'failed' : 'skipped')}">${status}</span> | ${ms}ms | retried=${retried}</li>`;
        })
        .join('');
    mainDom.assistantRequestLogList.innerHTML = `<ul>${rows}</ul>`;
}

function pushAssistantRequestLogEntry(action, status, latencyMs, retried) {
    assistantRequestLogEntries.push({
        action: String(action || 'assistant'),
        status: String(status || 'unknown'),
        latencyMs: Math.max(0, Math.floor(Number(latencyMs || 0))),
        retried: retried === true,
    });
    while (assistantRequestLogEntries.length > 10) {
        assistantRequestLogEntries.shift();
    }
    renderAssistantRequestLog();
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

function buildUnresolvedSnapshotFromReport(reportInput) {
    const report = reportInput && typeof reportInput === 'object' ? reportInput : {};
    const online = report.online_validation && typeof report.online_validation === 'object'
        ? report.online_validation
        : {};
    const enrichment = online.enrichment && typeof online.enrichment === 'object'
        ? online.enrichment
        : {};
    const entries = Array.isArray(online.entries) ? online.entries : [];
    const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];

    const unresolvedTrail = trail.filter((item) => {
        const autofillStatus = String(item && item.autofill_status || 'none');
        const doiRejected = Boolean(item && item.doi_rejected);
        const doiNeedsReview = Boolean(item && item.doi_needs_review);
        return doiRejected || doiNeedsReview || autofillStatus !== 'full';
    });
    const unresolvedEntryStatuses = entries.filter((item) => {
        const status = String(item && item.status || '');
        return ['mismatch', 'not_found', 'ambiguous', 'error'].includes(status);
    });
    const unresolvedCount = Math.max(
        unresolvedTrail.length,
        Number(enrichment.still_unresolved || 0),
        unresolvedEntryStatuses.length
    );

    const reasonCounts = {};
    unresolvedTrail.forEach((item) => {
        const chips = []
            .concat(Array.isArray(item && item.autofill_chips) ? item.autofill_chips : [])
            .concat(Array.isArray(item && item.auto_resolve_chips) ? item.auto_resolve_chips : [])
            .concat(Array.isArray(item && item.doi_reason_chips) ? item.doi_reason_chips : []);
        chips.forEach((chip) => {
            const key = String(chip || '').trim();
            if (!key) return;
            reasonCounts[key] = Number(reasonCounts[key] || 0) + 1;
        });
    });

    const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 4)
        .map((entry) => String(entry[0]));

    return {
        unresolvedCount,
        stillUnresolved: Number(enrichment.still_unresolved || 0),
        topReasons,
    };
}

function buildUnresolvedRerunDelta(beforeReport, afterReport) {
    const before = buildUnresolvedSnapshotFromReport(beforeReport);
    const after = buildUnresolvedSnapshotFromReport(afterReport);
    const resolvedDelta = Math.max(0, before.unresolvedCount - after.unresolvedCount);
    const regressedDelta = Math.max(0, after.unresolvedCount - before.unresolvedCount);
    return {
        before_unresolved: before.unresolvedCount,
        after_unresolved: after.unresolvedCount,
        resolved_delta: resolvedDelta,
        regressed_delta: regressedDelta,
        still_unresolved: after.stillUnresolved,
        top_reasons_after: after.topReasons,
    };
}

function deriveRunStagesFromState() {
    const report = mainState.fileContent.citationReferenceReport && typeof mainState.fileContent.citationReferenceReport === 'object'
        ? mainState.fileContent.citationReferenceReport
        : {};
    const online = report.online_validation && typeof report.online_validation === 'object'
        ? report.online_validation
        : {};
    const onlineSummary = online.summary && typeof online.summary === 'object' ? online.summary : {};
    const enrichment = online.enrichment && typeof online.enrichment === 'object'
        ? online.enrichment
        : {};
    const summary = report.summary && typeof report.summary === 'object' ? report.summary : {};
    const details = report.details && typeof report.details === 'object' ? report.details : {};
    const sourceTypeNumbers = details.source_type_numbers && typeof details.source_type_numbers === 'object'
        ? details.source_type_numbers
        : {};
    const bookValidation = details.book_validation && typeof details.book_validation === 'object'
        ? details.book_validation
        : {};
    const categoryCounts = report.category_counts && typeof report.category_counts === 'object'
        ? report.category_counts
        : {};
    const audit = mainState.fileContent.processingAudit && typeof mainState.fileContent.processingAudit === 'object'
        ? mainState.fileContent.processingAudit
        : {};
    const auditSummary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
    const mode = String(audit.mode || '').toLowerCase();
    const fallback = mode === 'rule_only' || Number(auditSummary.fallback_sections || 0) > 0;
    const serperEnabled = online.serper_enabled === true;
    const checked = Number(onlineSummary.checked || 0);
    const refCount = Number(summary.references || 0);
    const bookCount = Number(
        bookValidation.total_books
            || (Array.isArray(sourceTypeNumbers.book) ? sourceTypeNumbers.book.length : 0)
            || 0
    );
    const bookIssueCount = Number(bookValidation.issues || 0)
        || Number(categoryCounts.reference_missing_place || 0)
        || Number(categoryCounts.reference_missing_publisher || 0)
        || 0;
    const bookStatus = bookCount > 0 ? (bookIssueCount > 0 ? 'failed' : 'done') : 'skipped';
    const autoFillCount = Number(enrichment.fields_filled || 0);
    const doiInserted = Number(enrichment.doi_inserted || 0);
    const doiNeedsReview = Number(enrichment.doi_needs_review_inserted || 0);
    const doiRejected = Number(enrichment.doi_rejected || 0);
    const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];
    const confidenceCounts = trail.reduce((acc, item) => {
        const key = String(item && item.confidence || 'needs_review');
        acc[key] = Number(acc[key] || 0) + 1;
        return acc;
    }, {});
    const verifiedCount = Number(confidenceCounts.verified || 0);
    const likelyCount = Number(confidenceCounts.likely || 0);
    const needsReviewCount = Number(confidenceCounts.needs_review || 0);
    const enrichmentEnabled = enrichment.enabled === true;
    const autoFillStatus = enrichmentEnabled
        ? (doiRejected > 0 ? 'failed' : 'done')
        : 'skipped';
    const confidenceStatus = enrichmentEnabled
        ? (needsReviewCount > 0 ? 'failed' : (trail.length > 0 ? 'done' : 'skipped'))
        : 'skipped';
    const stages = [
        { name: 'Spelling check', status: 'done' },
        { name: 'Grammar check', status: 'done' },
        { name: 'Reference parsing', status: refCount > 0 ? 'done' : 'skipped' },
        {
            name: 'Book references',
            status: bookStatus,
            meta: `books=${bookCount}${bookCount > 0 ? `, issues=${bookIssueCount}` : ''}`,
        },
        {
            name: 'Reference validation',
            status: online.enabled === true ? (Number(onlineSummary.error || 0) > 0 ? 'failed' : 'done') : 'skipped',
            meta: `checked=${checked}`,
        },
        {
            name: 'Reference auto-fill',
            status: autoFillStatus,
            meta: enrichmentEnabled
                ? `filled=${autoFillCount}, doi_inserted=${doiInserted}, doi_review=${doiNeedsReview}, doi_rejected=${doiRejected}, mode=${String(enrichment.doi_mode || 'balanced')}`
                : 'disabled',
        },
        {
            name: 'Reference confidence',
            status: confidenceStatus,
            meta: enrichmentEnabled
                ? `verified=${verifiedCount}, likely=${likelyCount}, needs_review=${needsReviewCount}`
                : 'disabled',
        },
        {
            name: 'Serper validation',
            status: serperEnabled ? 'done' : 'skipped',
            meta: `enabled=${serperEnabled ? 'yes' : 'no'}`,
        },
        { name: 'Content consistency', status: (mode === 'sectioned' || mode === 'full') ? 'done' : 'skipped' },
        { name: 'Final validation', status: fallback ? 'failed' : 'done', meta: fallback ? 'fallback used' : 'stable' },
    ];
    const rerunMeta = mainState.fileContent.rerunActionMeta && typeof mainState.fileContent.rerunActionMeta === 'object'
        ? mainState.fileContent.rerunActionMeta
        : null;
    const delta = rerunMeta && rerunMeta.delta && typeof rerunMeta.delta === 'object' ? rerunMeta.delta : null;
    if (rerunMeta && String(rerunMeta.action || '') === 'rerun_unresolved_references' && delta) {
        const before = Number(delta.before_unresolved || 0);
        const afterCount = Number(delta.after_unresolved || 0);
        const resolved = Number(delta.resolved_delta || 0);
        const regressed = Number(delta.regressed_delta || 0);
        const status = regressed > 0 ? 'failed' : 'done';
        stages.push({
            name: 'Unresolved rerun delta',
            status,
            meta: `before=${before}, after=${afterCount}, resolved=${resolved}${regressed > 0 ? `, regressed=${regressed}` : ''}`,
        });
    }
    return stages;
}

function renderRunStagesFromState() {
    if (!mainDom.assistantRunStagesList) return;
    const hasData = !!(mainState.fileContent.processingAudit || mainState.fileContent.citationReferenceReport);
    if (!hasData) {
        mainDom.assistantRunStagesList.textContent = 'No run data yet.';
        return;
    }
    const rows = deriveRunStagesFromState()
        .map((stage) => {
            const meta = stage.meta ? ` (${appMain.helpers.escapeHtml(String(stage.meta))})` : '';
            const label = stageStatusLabel(stage.status);
            const icon = stageIcon(stage.status);
            return `<li>${appMain.helpers.escapeHtml(stage.name)}: <span class="stage-badge ${stage.status}">${icon} ${label}</span>${meta}</li>`;
        })
        .join('');
    mainDom.assistantRunStagesList.innerHTML = `<ul>${rows}</ul>`;
    renderAssistantQuickSummaryFromState();
    renderUnresolvedReferencesPanelFromState();
}

function renderAssistantQuickSummaryFromState() {
    if (!mainDom.assistantQuickSummary) return;
    const audit = mainState.fileContent.processingAudit && typeof mainState.fileContent.processingAudit === 'object'
        ? mainState.fileContent.processingAudit
        : {};
    const summary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
    const citation = mainState.fileContent.citationReferenceReport && typeof mainState.fileContent.citationReferenceReport === 'object'
        ? mainState.fileContent.citationReferenceReport
        : {};
    const citationSummary = citation.summary && typeof citation.summary === 'object' ? citation.summary : {};
    const strictIssues = mainState.fileContent.strictCmosIssues && typeof mainState.fileContent.strictCmosIssues === 'object'
        ? mainState.fileContent.strictCmosIssues
        : {};
    const strictCounts = strictIssues.counts && typeof strictIssues.counts === 'object'
        ? strictIssues.counts
        : {};
    const mode = String(audit.mode || '').toLowerCase();
    const fallbackSections = Number(summary.fallback_sections || 0);
    const totalSections = Number(summary.total_sections || 0);
    const acceptedSections = Number(summary.accepted_sections || 0);
    const cmos = summary.cmos_guardrails && typeof summary.cmos_guardrails === 'object' ? summary.cmos_guardrails : {};
    const cmosStatus = String(cmos.status || 'unknown');
    const cmosScore = Number(cmos.compliance_score || 0);
    const citationIssues = Number(citationSummary.citation_issues || 0);
    const referenceIssues = Number(citationSummary.reference_issues || 0);
    const strictTotal = Number(strictIssues.total || 0);
    const strictPunctuation = Number(strictCounts.punctuation || 0);
    const strictCapitalization = Number(strictCounts.capitalization || 0);
    const strictStyle = Number(strictCounts.style || 0);
    const strictSpelling = Number(strictCounts.spelling || 0);

    if (!mainState.fileContent.taskId) {
        mainDom.assistantQuickSummary.textContent = 'Open a task to view quality status and recommended next step.';
        return;
    }

    const sectionInfo = totalSections > 0
        ? `AI accepted ${acceptedSections}/${totalSections}; fallback ${fallbackSections}/${totalSections}.`
        : 'Section-level acceptance data not available.';
    const modeInfo = mode ? `Mode: ${mode}.` : 'Mode: unknown.';
    const strictInfo = `Strict CMOS total: ${strictTotal} (P:${strictPunctuation} C:${strictCapitalization} S:${strictStyle} Sp:${strictSpelling}).`;
    const qualityInfo = `CMOS: ${cmosStatus} (${cmosScore}). Citation issues: ${citationIssues}. Reference issues: ${referenceIssues}.`;
    let recommendation = 'Next: Ask assistant "what should I retry?" for guided settings.';
    if (fallbackSections > 0) recommendation = 'Next: Use "Retry Recommended" to reduce fallback sections.';
    if (citationIssues === 0 && referenceIssues === 0 && fallbackSections === 0) recommendation = 'Status looks healthy. You can export clean/redline output.';
    mainDom.assistantQuickSummary.textContent = `${sectionInfo} ${strictInfo} ${qualityInfo} ${modeInfo} ${recommendation}`;
}

function collectUnresolvedReferenceItemsFromState() {
    const report = mainState.fileContent.citationReferenceReport && typeof mainState.fileContent.citationReferenceReport === 'object'
        ? mainState.fileContent.citationReferenceReport
        : {};
    const online = report.online_validation && typeof report.online_validation === 'object'
        ? report.online_validation
        : {};
    const enrichment = online.enrichment && typeof online.enrichment === 'object'
        ? online.enrichment
        : {};
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
        const whyManualReview = String(item && item.why_manual_review || '').trim();
        const fixability = classifyUnresolvedFixability({
            status: doiRejected ? 'doi_rejected' : (doiNeedsReview ? 'doi_needs_review' : `autofill_${autofillStatus}`),
            whyManualReview,
            reasons: []
                .concat(Array.isArray(item && item.autofill_chips) ? item.autofill_chips : [])
                .concat(Array.isArray(item && item.auto_resolve_chips) ? item.auto_resolve_chips : [])
                .concat(Array.isArray(item && item.doi_reason_chips) ? item.doi_reason_chips : [])
        });
        byNumber.set(number, {
            number,
            severity: doiRejected ? 3 : (doiNeedsReview ? 2 : 1),
            status: doiRejected ? 'doi_rejected' : (doiNeedsReview ? 'doi_needs_review' : `autofill_${autofillStatus}`),
            fixability,
            whyManualReview,
            reasons: []
                .concat(Array.isArray(item && item.autofill_chips) ? item.autofill_chips : [])
                .concat(Array.isArray(item && item.auto_resolve_chips) ? item.auto_resolve_chips : [])
                .concat(Array.isArray(item && item.doi_reason_chips) ? item.doi_reason_chips : [])
                .map((chip) => String(chip || '').trim())
                .filter(Boolean),
        });
    });

    entries.forEach((item) => {
        const status = String(item && item.status || '');
        if (!['mismatch', 'not_found', 'ambiguous', 'error'].includes(status)) return;
        const number = Number(item && item.number || 0);
        if (!number) return;
        const current = byNumber.get(number) || { number, severity: 1, status: status, reasons: [] };
        const severity = status === 'error' ? 3 : (status === 'mismatch' ? 3 : 2);
        current.severity = Math.max(Number(current.severity || 1), severity);
        current.status = String(current.status || status);
        if (item && item.reason) current.reasons.push(String(item.reason));
        current.fixability = classifyUnresolvedFixability({
            status: current.status,
            whyManualReview: String(current.whyManualReview || ''),
            reasons: current.reasons
        });
        byNumber.set(number, current);
    });

    return Array.from(byNumber.values());
}

function classifyUnresolvedFixability(payload) {
    const status = String(payload && payload.status || '').toLowerCase();
    const whyManualReview = String(payload && payload.whyManualReview || '').toLowerCase();
    const reasons = Array.isArray(payload && payload.reasons) ? payload.reasons.map((v) => String(v || '').toLowerCase()) : [];
    const signal = `${status} ${whyManualReview} ${reasons.join(' ')}`;
    if (signal.includes('autofill_partial') || signal.includes('doi_needs_review') || signal.includes('likely_match')) {
        return 'auto-fixable';
    }
    if (signal.includes('not_found') || signal.includes('error') || signal.includes('untrusted_source')) {
        return 'needs-source';
    }
    return 'needs-human-judgment';
}

function sortUnresolvedItems(items) {
    const mode = mainDom.assistantUnresolvedSort ? String(mainDom.assistantUnresolvedSort.value || 'number_asc') : 'number_asc';
    const rows = Array.isArray(items) ? items.slice() : [];
    if (mode === 'number_desc') {
        rows.sort((a, b) => Number(b.number || 0) - Number(a.number || 0));
        return rows;
    }
    if (mode === 'severity_desc') {
        rows.sort((a, b) => {
            const delta = Number(b.severity || 0) - Number(a.severity || 0);
            if (delta !== 0) return delta;
            return Number(a.number || 0) - Number(b.number || 0);
        });
        return rows;
    }
    rows.sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
    return rows;
}

function renderUnresolvedReferencesPanelFromState() {
    if (!mainDom.assistantUnresolvedList) return;
    const items = sortUnresolvedItems(collectUnresolvedReferenceItemsFromState());
    if (items.length === 0) {
        mainDom.assistantUnresolvedList.textContent = 'No unresolved references yet.';
        return;
    }
    const rows = items.map((item) => {
        const number = Number(item.number || 0);
        const status = String(item.status || 'unresolved').replaceAll('_', ' ');
        const fixability = String(item.fixability || 'needs-human-judgment');
        const whyManualReview = String(item.whyManualReview || '').trim();
        const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean).slice(0, 3) : [];
        const reasonText = reasons.map((reason) => `[${appMain.helpers.escapeHtml(String(reason))}]`).join(' ');
        const reasonChip = whyManualReview ? `[manual:${appMain.helpers.escapeHtml(whyManualReview)}]` : '';
        const fixabilityChip = `[fixability:${appMain.helpers.escapeHtml(fixability)}]`;
        return `<li>[${number}] ${appMain.helpers.escapeHtml(status)} ${fixabilityChip} ${reasonChip} ${reasonText}</li>`;
    }).join('');
    mainDom.assistantUnresolvedList.innerHTML = `<ul>${rows}</ul>`;
}

function exportUnresolvedReferencesReport() {
    const taskId = String(mainState.fileContent.taskId || '').trim();
    if (!taskId) {
        setStatus('Load a task before exporting unresolved references.', 'warning');
        return;
    }
    const items = sortUnresolvedItems(collectUnresolvedReferenceItemsFromState());
    if (items.length === 0) {
        setStatus('No unresolved references to export.', 'success');
        return;
    }
    const lines = [];
    lines.push('Unresolved References Report');
    lines.push(`Task: ${taskId}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Count: ${items.length}`);
    lines.push('');
    items.forEach((item) => {
        const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean).slice(0, 5) : [];
        lines.push(`[${Number(item.number || 0)}] ${String(item.status || 'unresolved')}`);
        if (reasons.length > 0) {
            lines.push(`Reasons: ${reasons.join('; ')}`);
        }
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
    const diag = {
        endpoint: String(mainDom.assistantEndpointStatus && mainDom.assistantEndpointStatus.textContent || 'idle'),
        lastSuccess: String(mainDom.assistantLastSuccess && mainDom.assistantLastSuccess.textContent || 'never'),
        lastError: String(mainDom.assistantLastError && mainDom.assistantLastError.textContent || 'none'),
    };
    const stageLines = deriveRunStagesFromState().map((stage) => {
        const meta = stage.meta ? ` (${stage.meta})` : '';
        return `- ${stage.name}: ${stageStatusLabel(stage.status)}${meta}`;
    });
    const report = mainState.fileContent.citationReferenceReport && typeof mainState.fileContent.citationReferenceReport === 'object'
        ? mainState.fileContent.citationReferenceReport
        : {};
    const online = report.online_validation && typeof report.online_validation === 'object'
        ? report.online_validation
        : {};
    const enrichment = online.enrichment && typeof online.enrichment === 'object'
        ? online.enrichment
        : {};
    const trail = Array.isArray(enrichment.trail) ? enrichment.trail : [];
    const trailLines = trail.map((item) => {
        const number = Number(item && item.number || 0);
        const type = String(item && item.source_type || 'generic');
        const confidence = String(item && item.confidence || 'needs_review');
        const source = String(item && item.source || '');
        const fields = Array.isArray(item && item.fields_filled) ? item.fields_filled.join(',') : '';
        return `- [${number}] ${type} ${confidence} source=${source || 'n/a'} fields=${fields || 'none'} doi_inserted=${item && item.doi_inserted ? 'yes' : 'no'} doi_rejected=${item && item.doi_rejected ? 'yes' : 'no'}`;
    });
    const logLines = assistantRequestLogEntries
        .slice(-10)
        .reverse()
        .map((entry) => `- ${entry.action}: ${entry.status}, ${entry.latencyMs}ms, retried=${entry.retried ? 'yes' : 'no'}`);
    return [
        'Assistant Diagnostics',
        `Endpoint: ${diag.endpoint}`,
        `Last success: ${diag.lastSuccess}`,
        `Last error: ${diag.lastError}`,
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

function copyProseOnlyDiff() {
    const text = String(mainState.fileContent.proseOnlyDiff || '').trim();
    if (!text) {
        setStatus('No prose-only diff available to copy.', 'warning');
        return;
    }
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
    setStatus('Prose-only diff copied.', 'success');
}

function downloadProseOnlyDiff() {
    const text = String(mainState.fileContent.proseOnlyDiff || '').trim();
    if (!text) {
        setStatus('No prose-only diff available to download.', 'warning');
        return;
    }
    const taskId = String(mainState.fileContent.taskId || 'task').trim() || 'task';
    const blob = new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prose_only_diff_${taskId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatus('Prose-only diff downloaded.', 'success');
}

function setAssistantActionsLoading(loading, label) {
    assistantActionInFlight = loading === true;
    const controls = [
        mainDom.rerunUnresolvedBtn,
        mainDom.assistantAskBtn,
        mainDom.assistantReprocessBtn,
        mainDom.assistantApplyDecisionsBtn,
        mainDom.assistantRetryRecommendedBtn,
        mainDom.assistantRerunUnresolvedBtn,
    ];
    controls.forEach((btn) => {
        if (!btn) return;
        if (!btn.dataset.baseLabel) btn.dataset.baseLabel = btn.textContent || '';
        btn.disabled = assistantActionInFlight;
        btn.textContent = assistantActionInFlight
            ? `${btn.dataset.baseLabel}...`
            : btn.dataset.baseLabel;
    });
    if (assistantActionInFlight && label) {
        setStatus(String(label), 'warning');
    }
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
            const elapsed = Date.now() - startedAt;
            pushAssistantRequestLogEntry(actionName, 'timeout', elapsed, attempts > 1);
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
            const elapsed = Date.now() - startedAt;
            const status = finalResponse.success === true ? 'success' : 'failed';
            pushAssistantRequestLogEntry(actionName, status, elapsed, attempts > 1);
            onComplete(finalResponse);
        });
    };
    run();
}

function toggleAssistantChat(shouldOpen) {
    if (!mainDom.assistantChatPanel) return;
    const open = shouldOpen === true;
    mainDom.assistantChatPanel.classList.toggle('hidden', !open);
    if (open) setAssistantUnreadCount(0);
}

function appendAssistantChatMessage(role, text) {
    if (!mainDom.assistantOutput) return;
    const who = role === 'user' ? 'You' : 'Assistant';
    const line = `[${who}] ${String(text || '').trim()}`;
    const current = String(mainDom.assistantOutput.textContent || '').trim();
    const next = current ? `${current}\n\n${line}` : line;
    mainDom.assistantOutput.textContent = next;
    mainDom.assistantOutput.scrollTop = mainDom.assistantOutput.scrollHeight;
    const store = readAssistantChatStore();
    store[getAssistantTaskKey()] = next;
    writeAssistantChatStore(store);
    const isPanelOpen = mainDom.assistantChatPanel && !mainDom.assistantChatPanel.classList.contains('hidden');
    if (role === 'assistant' && !isPanelOpen) {
        setAssistantUnreadCount(assistantUnreadCount + 1);
    }
}

function restoreAssistantChatHistoryForCurrentTask() {
    const key = getAssistantTaskKey();
    if (assistantCurrentTaskKey === key) return;
    assistantCurrentTaskKey = key;
    const store = readAssistantChatStore();
    const saved = String(store[key] || '').trim();
    if (mainDom.assistantOutput) {
        mainDom.assistantOutput.textContent = saved || 'Assistant output appears here.';
    }
    renderAssistantQuickSummaryFromState();
    setAssistantUnreadCount(0);
}

function applyProcessingModeProviderContext(provider, model) {
    if (!mainDom.processingModeIndicator) return;
    const safeProvider = String(provider || '').trim() || 'unknown';
    const safeModel = String(model || '').trim() || 'unknown';
    mainDom.processingModeIndicator.title = `Provider: ${safeProvider} | Model: ${safeModel}`;
}

function getProviderModelFromOptions(options) {
    const ai = options && typeof options.ai === 'object' ? options.ai : {};
    return {
        provider: String(ai.provider || ''),
        model: String(ai.model || ''),
    };
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
    if (!mainDom.assistantFallbackPanel) return;
    const audit = mainState.fileContent.processingAudit && typeof mainState.fileContent.processingAudit === 'object'
        ? mainState.fileContent.processingAudit
        : {};
    const summary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
    const mode = String(audit.mode || '').toLowerCase();
    const reasons = summary.fallback_reason_counts && typeof summary.fallback_reason_counts === 'object'
        ? summary.fallback_reason_counts
        : {};
    const reasonEntries = Object.entries(reasons).filter((entry) => Number(entry[1]) > 0);
    const fallbackSections = Number(summary.fallback_sections || 0);
    const totalSections = Number(summary.total_sections || 0);
    const acceptedSections = Number(summary.accepted_sections || 0);
    const shouldShow = mode === 'rule_only' || fallbackSections > 0 || reasonEntries.length > 0;

    mainDom.assistantFallbackPanel.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) {
        if (mainDom.assistantFallbackSummary) mainDom.assistantFallbackSummary.textContent = 'No fallback details yet.';
        if (mainDom.assistantFallbackReasons) mainDom.assistantFallbackReasons.innerHTML = '';
        if (mainDom.assistantFallbackRecommendations) mainDom.assistantFallbackRecommendations.innerHTML = '';
        return;
    }

    const fallbackRatio = totalSections > 0 ? `${fallbackSections}/${totalSections}` : String(fallbackSections);
    if (mainDom.assistantFallbackSummary) {
        mainDom.assistantFallbackSummary.textContent = `Fallback sections: ${fallbackRatio}. Accepted sections: ${acceptedSections}.`;
    }

    if (mainDom.assistantFallbackReasons) {
        if (reasonEntries.length) {
            const list = reasonEntries
                .slice(0, 6)
                .map(([reason, count]) => `<li>${appMain.helpers.escapeHtml(String(reason))}: ${Number(count)}</li>`)
                .join('');
            mainDom.assistantFallbackReasons.innerHTML = `<div><strong>Top reasons</strong></div><ul>${list}</ul>`;
        } else {
            mainDom.assistantFallbackReasons.innerHTML = '<div><strong>Top reasons</strong>: not available for this run.</div>';
        }
    }

    if (mainDom.assistantFallbackRecommendations) {
        const cmos = summary.cmos_guardrails && typeof summary.cmos_guardrails === 'object' ? summary.cmos_guardrails : {};
        const recs = Array.isArray(cmos.recommendations) ? cmos.recommendations : [];
        if (recs.length) {
            const recList = recs.slice(0, 4).map((item) => `<li>${appMain.helpers.escapeHtml(String(item))}</li>`).join('');
            mainDom.assistantFallbackRecommendations.innerHTML = `<div><strong>Recommended next steps</strong></div><ul>${recList}</ul>`;
        } else {
            mainDom.assistantFallbackRecommendations.innerHTML = '<div><strong>Recommended next steps</strong>: Use retry with recommended settings.</div>';
        }
    }
}

function detectProcessingMode(payload) {
    const audit = payload && typeof payload.processing_audit === 'object' ? payload.processing_audit : {};
    const summary = audit && typeof audit.summary === 'object' ? audit.summary : {};
    const note = String((payload && payload.processing_note) || '').toLowerCase();
    const mode = String((audit && audit.mode) || '').toLowerCase();
    const finalDecision = String(((summary.final_selection || {}).decision) || '').toLowerCase();
    if (note.includes('fallback') || finalDecision.includes('fallback') || mode === 'rule_only') {
        return 'fallback';
    }
    if (mode === 'full' || mode === 'sectioned') {
        return 'ai';
    }
    return 'unknown';
}

function updateProcessingModeIndicatorFromPayload(payload) {
    if (!mainDom.processingModeIndicator) return;
    const mode = detectProcessingMode(payload);
    mainDom.processingModeIndicator.classList.remove('mode-ai', 'mode-fallback', 'mode-unknown');
    if (mode === 'ai') {
        mainDom.processingModeIndicator.classList.add('mode-ai');
        mainDom.processingModeIndicator.textContent = 'Mode: AI';
        return;
    }
    if (mode === 'fallback') {
        mainDom.processingModeIndicator.classList.add('mode-fallback');
        mainDom.processingModeIndicator.textContent = 'Mode: Fallback';
        return;
    }
    mainDom.processingModeIndicator.classList.add('mode-unknown');
    mainDom.processingModeIndicator.textContent = 'Mode: Unknown';
}

function pollTaskUntilProcessed(taskId) {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId || typeof eel === 'undefined' || typeof eel.get_task !== 'function') return;
    if (mainState.trackedProcessingTaskId && mainState.trackedProcessingTaskId !== safeTaskId) return;
    mainState.trackedProcessingTaskId = safeTaskId;
    if (!mainState.taskRecoveryStartedAt) {
        mainState.taskRecoveryStartedAt = Date.now();
    }
    mainState.taskRecoveryPollCount = Number(mainState.taskRecoveryPollCount || 0) + 1;
    eel.get_task(safeTaskId)(function (response) {
        if (mainState.trackedProcessingTaskId !== safeTaskId) {
            return;
        }
        const elapsedMs = Math.max(0, Date.now() - (mainState.taskRecoveryStartedAt || Date.now()));
        const shouldRefreshHistory = mainState.taskRecoveryPollCount === 1
            || (mainState.taskRecoveryPollCount % mainConstants.TASK_RECOVERY_HISTORY_REFRESH_EVERY) === 0;
        if (shouldRefreshHistory) {
            mainAuth.refreshTaskHistory();
        }
        if (!response || !response.success || !response.task) {
            if (elapsedMs >= mainConstants.TASK_RECOVERY_HARD_TIMEOUT_MS) {
                clearServerTaskTracking();
                mainState.isProcessingDocument = false;
                stopProcessingPresence();
                setStatus('Processing is taking unusually long and task tracking stopped. Open the latest task from history to check final state.', 'warning');
                refreshProcessButtonState();
                return;
            }
            setStatus(`Waiting for server task update... (${formatProcessingDuration(Math.floor(elapsedMs / 1000))})`, 'warning');
            scheduleTaskRecoveryPoll(safeTaskId);
            return;
        }
        const task = response.task;
        const status = String(task.status || '').toUpperCase();
        if (status === 'PROCESSED') {
            clearServerTaskTracking();
            mainState.isProcessingDocument = false;
            mainAuth.applyTaskDetailsToState(task);
            switch_tab('corrected');
            if (mainDom.saveCleanBtn) mainDom.saveCleanBtn.disabled = false;
            if (mainDom.saveHighlightBtn) mainDom.saveHighlightBtn.disabled = false;
            stopProcessingPresence();
            setStatus('Processing complete (recovered after transient server response issue)', 'success');
            showAssistantToast('Processing completed in background.');
            setProgress(100);
            refreshProcessButtonState();
            return;
        }
        if (status === 'FAILED') {
            const reports = task.reports && typeof task.reports === 'object' ? task.reports : {};
            clearServerTaskTracking();
            mainState.isProcessingDocument = false;
            stopProcessingPresence();
            setStatus('Processing failed', 'error');
            showAssistantToast('Background processing failed.');
            alert('Processing error: ' + String(reports.processing_note || task.error || 'Task failed on server.'));
            refreshProcessButtonState();
            return;
        }
        mainAuth.applyTaskDetailsToState(task);
        if (elapsedMs >= mainConstants.TASK_RECOVERY_HARD_TIMEOUT_MS) {
            clearServerTaskTracking();
            mainState.isProcessingDocument = false;
            stopProcessingPresence();
            setStatus('Processing is taking unusually long and automatic tracking stopped. The task remains in history and may still finish on the server.', 'warning');
            refreshProcessButtonState();
            return;
        }
        setStatus(buildTaskRecoveryStatus(status, elapsedMs), 'warning');
        scheduleTaskRecoveryPoll(safeTaskId);
    });
}

function process_document() {
    if (mainState.isFileLoading) {
        mainState.pendingProcessAfterLoad = true;
        setStatus('File is still loading. Processing will start automatically when upload finishes.', 'warning');
        refreshProcessButtonState();
        return;
    }
    if (!mainState.fileContent.original) {
        alert('Please load a document first.');
        return;
    }

    mainState.isProcessingDocument = true;
    clearServerTaskTracking();
    setStatus('Processing...', 'warning');
    setProgress(30);
    startProcessingPresence();
    refreshProcessButtonState();
    const options = mainAuth.buildProcessingOptionsFromRuntimeSettings();
    const processProviderModel = getProviderModelFromOptions(options);
    mainSettings.saveAiSettings();
    eel.process_document(options, mainState.fileContent.taskId || '')(function (response) {
        let keepProcessingState = false;
        if (response.success) {
            clearServerTaskTracking();
            applyProcessResponseToState(response, { keepGroupDecisions: false });
            applyProcessingModeProviderContext(processProviderModel.provider, processProviderModel.model);
            switch_tab('corrected');
            const wordCountEl = document.getElementById('word-count');
            if (wordCountEl) wordCountEl.textContent = 'Words: ' + response.word_count;
            if (mainDom.saveCleanBtn) mainDom.saveCleanBtn.disabled = false;
            if (mainDom.saveHighlightBtn) mainDom.saveHighlightBtn.disabled = false;
            if (response.processing_note && response.processing_note.toLowerCase().includes('fallback')) {
                setStatus('Processing complete (safe fallback applied)', 'warning');
                showAssistantToast('Processing completed with fallback.');
            } else {
                setStatus('Processing complete', 'success');
                showAssistantToast('Processing completed successfully.');
            }
            stopProcessingPresence();
            setProgress(100);
            mainAuth.refreshTaskHistory();
        } else {
            const errorText = String((response && response.error) || 'Unknown server error');
            stopProcessingPresence();
            setStatus('Error: ' + errorText, 'error');
            const looksLikeInvalidJson = /invalid json response from server/i.test(errorText);
            if (looksLikeInvalidJson && String(mainState.fileContent.taskId || '').trim()) {
                mainState.taskRecoveryStartedAt = Date.now();
                mainState.taskRecoveryPollCount = 0;
                keepProcessingState = true;
                startServerTaskTracking(
                    mainState.fileContent.taskId,
                    'Server returned a transient response. Continuing to track processing automatically...'
                );
            } else {
                clearServerTaskTracking();
                alert('Processing error: ' + errorText);
            }
        }
        mainState.isProcessingDocument = keepProcessingState;
        refreshProcessButtonState();
    });
}

function applyCurrentGroupDecisions() {
    if (mainState.isApplyingGroupDecisions) {
        mainState.pendingGroupDecisionApply = true;
        return;
    }
    if (!mainState.fileContent.original || !mainState.fileContent.corrected) return;
    if (typeof eel === 'undefined' || typeof eel.apply_correction_group_decisions !== 'function') return;

    mainState.isApplyingGroupDecisions = true;
    setStatus('Applying change decisions...', 'warning');
    const payload = {
        task_id: mainState.fileContent.taskId || '',
        group_decisions: mainPreview.normalizeGroupDecisions(mainState.fileContent.groupDecisions),
        original_text: mainState.fileContent.original || '',
        full_corrected_text: mainState.fileContent.fullCorrectedText || mainState.fileContent.corrected || ''
    };
    eel.apply_correction_group_decisions(payload)(function (response) {
        mainState.isApplyingGroupDecisions = false;
        const hadPending = mainState.pendingGroupDecisionApply;
        mainState.pendingGroupDecisionApply = false;
        if (response && response.success) {
            applyProcessResponseToState(response, { keepGroupDecisions: true });
            mainPreview.renderCurrentPreview();
            setStatus('Decision update applied', 'success');
            mainAuth.refreshTaskHistory();
            if (hadPending) applyCurrentGroupDecisions();
            return;
        }
        setStatus('Decision update failed', 'error');
        alert('Decision update error: ' + (response && response.error ? String(response.error) : 'Could not apply decisions'));
        if (hadPending) applyCurrentGroupDecisions();
    });
}

function renderAssistantSuggestions(suggestions) {
    if (!mainDom.assistantSuggestions) return;
    const items = Array.isArray(suggestions) ? suggestions : [];
    if (!items.length) {
        mainDom.assistantSuggestions.innerHTML = '';
        return;
    }
    const html = items
        .slice(0, 4)
        .map((item) => `<li>${appMain.helpers.escapeHtml(String(item || ''))}</li>`)
        .join('');
    mainDom.assistantSuggestions.innerHTML = `<ul>${html}</ul>`;
}

function askAssistantQuestion() {
    if (typeof eel === 'undefined' || typeof eel.assistant_query !== 'function') return;
    if (assistantActionInFlight) return;
    const taskId = String(mainState.fileContent.taskId || '').trim();
    const message = mainDom.assistantQuestionInput ? String(mainDom.assistantQuestionInput.value || '').trim() : '';
    const includeAdminActivity = !!(mainDom.assistantIncludeAdminActivityInput && mainDom.assistantIncludeAdminActivityInput.checked);
    if (!taskId && !message) {
        setStatus('Select a task or enter a question for assistant diagnostics.', 'warning');
        return;
    }
    toggleAssistantChat(true);
    if (message) appendAssistantChatMessage('user', message);
    appendAssistantChatMessage('assistant', 'Preparing diagnostics...');
    setAssistantActionsLoading(true, 'Assistant request in progress...');
    callAssistantWithRetry('ask', (done) => {
        eel.assistant_query({
            task_id: taskId,
            message,
            include_admin_activity: includeAdminActivity
        })(done);
    }, (response) => {
        setAssistantActionsLoading(false);
        if (!(response && response.success)) {
            setStatus('Assistant query failed', 'error');
            const errorMessage = response && response.error ? String(response.error) : 'Request failed';
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

function assistantReprocessCurrentTask() {
    if (typeof eel === 'undefined' || typeof eel.assistant_reprocess_task !== 'function') return;
    if (assistantActionInFlight) return;
    const taskId = String(mainState.fileContent.taskId || '').trim();
    if (!taskId) {
        setStatus('Load a task before assistant reprocess.', 'warning');
        return;
    }
    const options = mainAuth.buildProcessingOptionsFromRuntimeSettings();
    const reprocessProviderModel = getProviderModelFromOptions(options);
    toggleAssistantChat(true);
    appendAssistantChatMessage('assistant', 'Reprocessing current task...');
    setAssistantActionsLoading(true, 'Assistant is reprocessing current task...');
    callAssistantWithRetry('reprocess', (done) => {
        eel.assistant_reprocess_task(taskId, options)(done);
    }, (response) => {
        setAssistantActionsLoading(false);
        if (!(response && response.success && response.result && response.result.success)) {
            setStatus('Assistant reprocess failed', 'error');
            const errorMessage = response && response.error ? String(response.error) : 'Request failed';
            setAssistantUnavailable(true, errorMessage);
            updateAssistantDiagnostics('failed', errorMessage, 0);
            appendAssistantChatMessage('assistant', `Reprocess failed: ${errorMessage}`);
            alert('Assistant reprocess error: ' + (response && response.error ? String(response.error) : 'Unknown error'));
            return;
        }
        setAssistantUnavailable(false);
        updateAssistantDiagnostics('ok', 'none', Date.now());
        applyProcessResponseToState(response.result, { keepGroupDecisions: false });
        applyProcessingModeProviderContext(reprocessProviderModel.provider, reprocessProviderModel.model);
        appendAssistantChatMessage('assistant', 'Reprocess complete.');
        switch_tab('corrected');
        mainAuth.refreshTaskHistory();
        setStatus('Assistant reprocess complete', 'success');
        showAssistantToast('Assistant reprocess completed.');
    });
}

function assistantApplyCurrentDecisions() {
    if (typeof eel === 'undefined' || typeof eel.assistant_apply_group_decisions !== 'function') return;
    if (assistantActionInFlight) return;
    const taskId = String(mainState.fileContent.taskId || '').trim();
    if (!taskId) {
        setStatus('Load a task before assistant decision apply.', 'warning');
        return;
    }
    const groupDecisions = mainPreview.normalizeGroupDecisions(mainState.fileContent.groupDecisions);
    const currentProcessingOptions = mainAuth.buildProcessingOptionsFromRuntimeSettings();
    const decisionProviderModel = getProviderModelFromOptions(currentProcessingOptions);
    toggleAssistantChat(true);
    appendAssistantChatMessage('assistant', 'Applying current correction decisions...');
    setAssistantActionsLoading(true, 'Assistant is applying correction decisions...');
    callAssistantWithRetry('apply_decisions', (done) => {
        eel.assistant_apply_group_decisions(
            taskId,
            groupDecisions,
            mainState.fileContent.fullCorrectedText || mainState.fileContent.corrected || ''
        )(done);
    }, (response) => {
        setAssistantActionsLoading(false);
        if (!(response && response.success && response.result && response.result.success)) {
            setStatus('Assistant decision apply failed', 'error');
            const errorMessage = response && response.error ? String(response.error) : 'Request failed';
            setAssistantUnavailable(true, errorMessage);
            updateAssistantDiagnostics('failed', errorMessage, 0);
            appendAssistantChatMessage('assistant', `Apply decisions failed: ${errorMessage}`);
            alert('Assistant decision apply error: ' + (response && response.error ? String(response.error) : 'Unknown error'));
            return;
        }
        setAssistantUnavailable(false);
        updateAssistantDiagnostics('ok', 'none', Date.now());
        applyProcessResponseToState(response.result, { keepGroupDecisions: true });
        applyProcessingModeProviderContext(decisionProviderModel.provider, decisionProviderModel.model);
        appendAssistantChatMessage('assistant', 'Decisions applied successfully.');
        mainPreview.renderCurrentPreview();
        mainAuth.refreshTaskHistory();
        setStatus('Assistant applied correction decisions', 'success');
        showAssistantToast('Assistant applied decisions.');
    });
}

function retryWithRecommendedSettings() {
    if (typeof eel === 'undefined' || typeof eel.assistant_reprocess_task !== 'function') return;
    if (assistantActionInFlight) return;
    const taskId = String(mainState.fileContent.taskId || '').trim();
    if (!taskId) {
        setStatus('Load a task before retrying with recommended settings.', 'warning');
        return;
    }
    const baseOptions = mainAuth.buildProcessingOptionsFromRuntimeSettings();
    const retryOptions = buildFallbackRetryOptions(baseOptions);
    const providerModel = getProviderModelFromOptions(retryOptions);
    toggleAssistantChat(true);
    appendAssistantChatMessage('assistant', 'Retrying with recommended settings...');
    setAssistantActionsLoading(true, 'Retrying with recommended settings...');
    callAssistantWithRetry('retry_recommended', (done) => {
        eel.assistant_reprocess_task(taskId, retryOptions)(done);
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
        switch_tab('corrected');
        mainAuth.refreshTaskHistory();
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
    if (assistantActionInFlight) {
        setStatus('Another assistant action is already running. Please wait a moment.', 'warning');
        return;
    }
    const taskId = String(mainState.fileContent.taskId || '').trim();
    if (!taskId) {
        setStatus('Load a task before rerunning unresolved references.', 'warning');
        toggleAssistantChat(true);
        appendAssistantChatMessage('assistant', 'Please open a task first, then run unresolved references rerun.');
        return;
    }
    const baseOptions = mainAuth.buildProcessingOptionsFromRuntimeSettings();
    const retryOptions = Object.assign({}, baseOptions, {
        unresolved_reference_only: true,
        unresolved_fixability_filter: String(filterMode || 'all'),
        spelling: false,
        sentence_case: false,
        punctuation: false,
        chicago_style: true
    });
    const aiOptions = baseOptions && baseOptions.ai && typeof baseOptions.ai === 'object'
        ? Object.assign({}, baseOptions.ai)
        : {};
    aiOptions.enabled = false;
    retryOptions.ai = aiOptions;

    const providerModel = getProviderModelFromOptions(retryOptions);
    const beforeReportSnapshot = mainState.fileContent.citationReferenceReport && typeof mainState.fileContent.citationReferenceReport === 'object'
        ? mainState.fileContent.citationReferenceReport
        : {};
    toggleAssistantChat(true);
    const modeLabel = String(filterMode || 'all') === 'auto_fixable' ? 'auto-fixable unresolved references' : 'unresolved references';
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
        applyProcessResponseToState(response.result, {
            keepGroupDecisions: false,
            rerunActionMeta: {
                action: String(filterMode || 'all') === 'auto_fixable' ? 'rerun_auto_fixable_unresolved_references' : 'rerun_unresolved_references',
                path: String(rerunPath || 'unknown'),
                label: rerunPath === 'assistant_endpoint' ? 'Used assistant endpoint' : (rerunPath === 'direct_process_fallback' ? 'Used direct fallback' : 'Used unknown path'),
                delta: buildUnresolvedRerunDelta(beforeReportSnapshot, response.result.citation_reference_report || {}),
                at: Date.now()
            }
        });
        applyProcessingModeProviderContext(providerModel.provider, providerModel.model);
        const delta = buildUnresolvedRerunDelta(beforeReportSnapshot, response.result.citation_reference_report || {});
        appendAssistantChatMessage(
            'assistant',
            `Unresolved references rerun complete. Before: ${delta.before_unresolved}, After: ${delta.after_unresolved}, Resolved: ${delta.resolved_delta}${delta.regressed_delta > 0 ? `, Regressed: ${delta.regressed_delta}` : ''}. Mode: ${modeLabel}.`
        );
        switch_tab('corrected');
        mainAuth.refreshTaskHistory();
        setStatus(`Rerun complete (${modeLabel}) (${delta.before_unresolved} -> ${delta.after_unresolved})`, 'success');
        showAssistantToast('Unresolved references rerun completed.');
    };

    if (typeof eel !== 'undefined' && typeof eel.assistant_reprocess_task === 'function') {
        callAssistantWithRetry('rerun_unresolved_references', (done) => {
            eel.assistant_reprocess_task(taskId, retryOptions)(done);
        }, (response) => finish(response, 'assistant_endpoint'));
        return;
    }

    if (typeof eel !== 'undefined' && typeof eel.process_document === 'function') {
        appendAssistantChatMessage('assistant', 'Assistant action endpoint is unavailable, using direct process fallback.');
        callAssistantWithRetry('rerun_unresolved_references_fallback', (done) => {
            eel.process_document(retryOptions, taskId)(function (response) {
                if (response && response.success) {
                    done({ success: true, result: response });
                    return;
                }
                done({ success: false, error: response && response.error ? String(response.error) : 'Fallback processing failed' });
            });
        }, (response) => finish(response, 'direct_process_fallback'));
        return;
    }

    setAssistantActionsLoading(false);
    const bridgeError = 'Bridge unavailable: cannot call assistant or process endpoints.';
    setAssistantUnavailable(true, bridgeError);
    updateAssistantDiagnostics('failed', bridgeError, 0);
    appendAssistantChatMessage('assistant', `Unresolved references rerun failed: ${bridgeError}`);
    setStatus('Rerun unresolved references is unavailable in this mode.', 'warning');
}

function setGroupDecision(groupKey, accepted) {
    if (!mainConstants.CORRECTION_GROUP_ORDER.includes(groupKey)) return;
    mainState.fileContent.groupDecisions = mainPreview.normalizeGroupDecisions(mainState.fileContent.groupDecisions);
    mainState.fileContent.groupDecisions[groupKey] = !!accepted;
    appMain.syncWindowFileContent();
    if (mainState.currentTab === 'corrections') mainPreview.renderCurrentPreview();
    applyCurrentGroupDecisions();
}

function applyAllGroupDecisions(accepted) {
    const next = mainPreview.buildDefaultGroupDecisions();
    mainConstants.CORRECTION_GROUP_ORDER.forEach((key) => {
        next[key] = !!accepted;
    });
    mainState.fileContent.groupDecisions = next;
    appMain.syncWindowFileContent();
    if (mainState.currentTab === 'corrections') mainPreview.renderCurrentPreview();
    applyCurrentGroupDecisions();
}

function save_file(file_type) {
    const isBrowserWebMode = window.__MANUSCRIPT_WEB_MODE__ === true;
    const taskIdForDirectDownload = String(mainState.fileContent.taskId || '').trim();
    function buildSaveErrorMessage(response) {
        const code = response && response.error_code ? String(response.error_code) : 'UNKNOWN_SAVE_ERROR';
        const message = response && response.error ? String(response.error) : 'Unknown save error';
        return `Download failed\nCode: ${code}\nMessage: ${message}`;
    }
    function fallbackLegacySave() {
        eel.save_file(file_type)(function (response) {
            if (response.success) {
                setStatus(file_type + ' version saved', 'success');
                let msg = 'File saved to:\n' + response.path;
                if (response.note) msg += '\n\nNote:\n' + response.note;
                alert(msg);
            } else {
                setStatus('Save failed', 'error');
                alert(buildSaveErrorMessage(response));
            }
        });
    }
    function downloadBase64Docx(base64Data, fileName, mimeType) {
        const binary = atob(String(base64Data || ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'manuscript.docx';
        document.body.appendChild(link);
        link.click();
        window.setTimeout(() => {
            try { document.body.removeChild(link); } catch (err) {}
            URL.revokeObjectURL(url);
        }, 60_000);
    }
    if (isBrowserWebMode && taskIdForDirectDownload) {
        const query = new URLSearchParams({ type: file_type, _ts: String(Date.now()) });
        window.location.assign(`/api/tasks/${encodeURIComponent(taskIdForDirectDownload)}/download-file?${query.toString()}`);
        setStatus(file_type + ' version downloaded', 'success');
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.export_file !== 'function') {
        fallbackLegacySave();
        return;
    }
    setStatus('Preparing download...', 'warning');
    eel.export_file({
        task_id: mainState.fileContent.taskId || '',
        source_type: mainState.fileContent.sourceType || 'text',
        source_docx_base64: mainState.fileContent.sourceDocxBase64 || '',
        file_type,
        original_text: mainState.fileContent.original || '',
        corrected_text: mainState.fileContent.corrected || '',
        file_name: mainState.fileContent.fileName || 'manuscript.docx'
    })(function (response) {
        if (response && response.success && response.base64_data) {
            downloadBase64Docx(response.base64_data, response.file_name, response.mime_type);
            setStatus(file_type + ' version downloaded', 'success');
            return;
        }
        if (isBrowserWebMode) {
            setStatus('Download failed', 'error');
            alert(buildSaveErrorMessage(response));
            return;
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
    mainState.fileContent = mainFactories.createEmptyFileContent();
    mainState.isFileLoading = false;
    mainState.isProcessingDocument = false;
    mainState.pendingProcessAfterLoad = false;
    clearServerTaskTracking();
    stopProcessingPresence();
    appMain.syncWindowFileContent();
    mainAuth.renderAdminDocxStructureSummary();
    const fileNameEl = document.getElementById('file-name');
    const wordCountEl = document.getElementById('word-count');
    if (fileNameEl) fileNameEl.textContent = 'No file selected';
    if (wordCountEl) wordCountEl.textContent = 'Words: 0';
    if (mainDom.saveCleanBtn) mainDom.saveCleanBtn.disabled = true;
    if (mainDom.saveHighlightBtn) mainDom.saveHighlightBtn.disabled = true;
    if (mainDom.fileInput) mainDom.fileInput.value = '';
    if (mainDom.assistantOutput) mainDom.assistantOutput.textContent = 'Assistant output appears here.';
    toggleAssistantChat(false);
    setAssistantActionsLoading(false);
    setAssistantUnreadCount(0);
    setAssistantUnavailable(false);
    updateAssistantDiagnostics('idle', 'none', 0);
    updateProcessingModeIndicatorFromPayload({});
    applyProcessingModeProviderContext('', '');
    renderRunStagesFromState();
    renderUnresolvedReferencesPanelFromState();
    renderFallbackInsightsFromCurrentState();
    renderAssistantSuggestions([]);
    switch_tab('original');
    setStatus('Ready', 'info');
    setProgress(0);
    refreshProcessButtonState();
}

appMain.actions = {
    handleFile,
    handleLoadResponse,
    switch_tab,
    switch_view,
    setStatus,
    refreshProcessButtonState,
    setProgress,
    startProcessingPresence,
    stopProcessingPresence,
    startServerTaskTracking,
    applyProcessResponseToState,
    pollTaskUntilProcessed,
    process_document,
    applyCurrentGroupDecisions,
    askAssistantQuestion,
    assistantReprocessCurrentTask,
    assistantApplyCurrentDecisions,
    retryWithRecommendedSettings,
    rerunUnresolvedReferencesOnly,
    rerunAutoFixableReferencesOnly,
    copyAssistantDiagnostics,
    copyProseOnlyDiff,
    downloadProseOnlyDiff,
    exportUnresolvedReferencesReport,
    toggleAssistantChat,
    restoreAssistantChatHistoryForCurrentTask,
    renderRunStagesFromState,
    renderUnresolvedReferencesPanelFromState,
    renderFallbackInsightsFromCurrentState,
    setGroupDecision,
    applyAllGroupDecisions,
    save_file,
    clear_all
};

window.setGroupDecision = setGroupDecision;
window.applyAllGroupDecisions = applyAllGroupDecisions;
window.copyProseOnlyDiff = copyProseOnlyDiff;
window.downloadProseOnlyDiff = downloadProseOnlyDiff;

mainAuth.updateAdminGlobalAiProviderUI(false);
mainAuth.updateAdminAiValidationHint();
mainAuth.applyRouteViewMode();
updateAssistantRouteHint();
updateAssistantDiagnostics('idle', 'none', 0);
applyProcessingModeProviderContext('', '');
renderFallbackInsightsFromCurrentState();
renderRunStagesFromState();
renderUnresolvedReferencesPanelFromState();
restoreAssistantChatHistoryForCurrentTask();
setAssistantUnreadCount(0);
renderAssistantRequestLog();
mainAuth.checkAuthenticatedUser();
refreshProcessButtonState();

window.addEventListener('pageshow', () => {
    mainAuth.applyRouteViewMode();
    updateAssistantRouteHint();
    restoreAssistantChatHistoryForCurrentTask();
    mainAuth.syncAdminDashboardRouteState();
    mainAuth.resetAdminDashboardScroll();
});

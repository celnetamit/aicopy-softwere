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
    if (!mainDom.processBtn) {
        return;
    }
    mainDom.processBtn.disabled = mainState.isFileLoading || mainState.isProcessingDocument || !String(mainState.fileContent.original || '').trim();
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
    mainState.fileContent.corrections = response.corrections_report || null;
    mainState.fileContent.nounReport = response.noun_report || null;
    mainState.fileContent.domainReport = response.domain_report || null;
    mainState.fileContent.journalProfileReport = response.journal_profile_report || null;
    mainState.fileContent.citationReferenceReport = response.citation_reference_report || null;
    mainState.fileContent.processingAudit = response.processing_audit || null;
    mainState.fileContent.groupDecisions = keepGroupDecisions
        ? mainPreview.normalizeGroupDecisions(mainState.fileContent.groupDecisions)
        : mainPreview.buildDefaultGroupDecisions();
    appMain.syncWindowFileContent();
    restoreAssistantChatHistoryForCurrentTask();
    updateProcessingModeIndicatorFromPayload(response);
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

function setAssistantActionsLoading(loading, label) {
    assistantActionInFlight = loading === true;
    const controls = [
        mainDom.assistantAskBtn,
        mainDom.assistantReprocessBtn,
        mainDom.assistantApplyDecisionsBtn,
        mainDom.assistantRetryRecommendedBtn,
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

function callAssistantWithRetry(executor, onComplete) {
    let attempts = 0;
    let done = false;
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
            onComplete(response || { success: false, error: 'Empty response' });
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
    callAssistantWithRetry((done) => {
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
    callAssistantWithRetry((done) => {
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
    callAssistantWithRetry((done) => {
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
    callAssistantWithRetry((done) => {
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
    toggleAssistantChat,
    restoreAssistantChatHistoryForCurrentTask,
    renderFallbackInsightsFromCurrentState,
    setGroupDecision,
    applyAllGroupDecisions,
    save_file,
    clear_all
};

window.setGroupDecision = setGroupDecision;
window.applyAllGroupDecisions = applyAllGroupDecisions;

mainAuth.updateAdminGlobalAiProviderUI(false);
mainAuth.updateAdminAiValidationHint();
mainAuth.applyRouteViewMode();
updateAssistantRouteHint();
updateAssistantDiagnostics('idle', 'none', 0);
applyProcessingModeProviderContext('', '');
renderFallbackInsightsFromCurrentState();
restoreAssistantChatHistoryForCurrentTask();
setAssistantUnreadCount(0);
mainAuth.checkAuthenticatedUser();
refreshProcessButtonState();

window.addEventListener('pageshow', () => {
    mainAuth.applyRouteViewMode();
    updateAssistantRouteHint();
    restoreAssistantChatHistoryForCurrentTask();
    mainAuth.syncAdminDashboardRouteState();
    mainAuth.resetAdminDashboardScroll();
});

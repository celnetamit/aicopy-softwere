const appMain = window.ManuscriptEditorApp;
const mainState = appMain.state;
const mainDom = appMain.dom;
const mainAuth = appMain.authAdmin;
const mainPreview = appMain.preview;
const mainSettings = appMain.settings;
const mainFactories = appMain.factories;
const mainConstants = appMain.constants;

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

function refreshProcessButtonState() {
    if (!mainDom.processBtn) {
        return;
    }
    mainDom.processBtn.disabled = mainState.isFileLoading || mainState.isProcessingDocument || !String(mainState.fileContent.original || '').trim();
}

function setProgress(progress) {
    document.getElementById('progress-fill').style.width = progress + '%';
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
            document.getElementById('file-name').textContent = displayName;
            document.getElementById('word-count').textContent = 'Words: ' + response.word_count;
            switch_tab('original');
            document.getElementById('save-clean-btn').disabled = true;
            document.getElementById('save-highlight-btn').disabled = true;
            refreshProcessButtonState();
            setStatus('File loaded successfully', 'success');
            mainAuth.refreshTaskHistory();
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
}

function pollTaskUntilProcessed(taskId, attempt = 0) {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId || typeof eel === 'undefined' || typeof eel.get_task !== 'function') return;
    const maxAttempts = 8;
    eel.get_task(safeTaskId)(function (response) {
        if (!response || !response.success || !response.task) {
            if (attempt < maxAttempts - 1) window.setTimeout(() => pollTaskUntilProcessed(safeTaskId, attempt + 1), 1200);
            else setStatus('Processing failed: could not recover task state', 'error');
            return;
        }
        const task = response.task;
        const status = String(task.status || '').toUpperCase();
        if (status === 'PROCESSED') {
            mainAuth.applyTaskDetailsToState(task);
            switch_tab('corrected');
            if (mainDom.saveCleanBtn) mainDom.saveCleanBtn.disabled = false;
            if (mainDom.saveHighlightBtn) mainDom.saveHighlightBtn.disabled = false;
            stopProcessingPresence();
            setStatus('Processing complete (recovered after transient server response issue)', 'success');
            setProgress(100);
            return;
        }
        if (status === 'FAILED') {
            const reports = task.reports && typeof task.reports === 'object' ? task.reports : {};
            stopProcessingPresence();
            setStatus('Processing failed', 'error');
            alert('Processing error: ' + String(reports.processing_note || task.error || 'Task failed on server.'));
            return;
        }
        if (attempt < maxAttempts - 1) {
            window.setTimeout(() => pollTaskUntilProcessed(safeTaskId, attempt + 1), 1200);
            return;
        }
        setStatus('Processing still running on server. Refresh task list and open the latest task.', 'warning');
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
    setStatus('Processing...', 'warning');
    setProgress(30);
    startProcessingPresence();
    refreshProcessButtonState();
    const options = mainAuth.buildProcessingOptionsFromRuntimeSettings();
    mainSettings.saveAiSettings();
    eel.process_document(options, mainState.fileContent.taskId || '')(function (response) {
        if (response.success) {
            applyProcessResponseToState(response, { keepGroupDecisions: false });
            switch_tab('corrected');
            document.getElementById('word-count').textContent = 'Words: ' + response.word_count;
            document.getElementById('save-clean-btn').disabled = false;
            document.getElementById('save-highlight-btn').disabled = false;
            if (response.processing_note && response.processing_note.toLowerCase().includes('fallback')) {
                setStatus('Processing complete (safe fallback applied)', 'warning');
            } else {
                setStatus('Processing complete', 'success');
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
                startProcessingPresence();
                setStatus('Server returned a transient non-JSON response. Attempting task recovery...', 'warning');
                pollTaskUntilProcessed(mainState.fileContent.taskId, 0);
            } else {
                alert('Processing error: ' + errorText);
            }
        }
        mainState.isProcessingDocument = false;
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
    stopProcessingPresence();
    appMain.syncWindowFileContent();
    mainAuth.renderAdminDocxStructureSummary();
    document.getElementById('file-name').textContent = 'No file selected';
    document.getElementById('word-count').textContent = 'Words: 0';
    document.getElementById('save-clean-btn').disabled = true;
    document.getElementById('save-highlight-btn').disabled = true;
    document.getElementById('file-input').value = '';
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
    applyProcessResponseToState,
    pollTaskUntilProcessed,
    process_document,
    applyCurrentGroupDecisions,
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
mainAuth.checkAuthenticatedUser();
refreshProcessButtonState();

window.addEventListener('pageshow', () => {
    mainAuth.applyRouteViewMode();
    mainAuth.syncAdminDashboardRouteState();
    mainAuth.resetAdminDashboardScroll();
});

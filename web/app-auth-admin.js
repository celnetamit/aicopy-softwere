const appAuth = window.ManuscriptEditorApp;
const authState = appAuth.state;
const authDom = appAuth.dom;
const authHelpers = appAuth.helpers;
const authConstants = appAuth.constants;

function setLoginStatus(message, type = 'info') {
    if (!authDom.loginStatus) {
        return;
    }
    authDom.loginStatus.textContent = message || '';
    const colors = {
        info: '#a8bddf',
        success: '#a9f2d3',
        warning: '#ffd58d',
        error: '#ffb8c2'
    };
    authDom.loginStatus.style.color = colors[type] || colors.info;
}

function showLoginView() {
    if (authDom.loginView) {
        authDom.loginView.classList.remove('hidden');
    }
    if (authDom.appShell) {
        authDom.appShell.classList.add('hidden');
    }
}

function showAppView() {
    if (authDom.loginView) {
        authDom.loginView.classList.add('hidden');
    }
    if (authDom.appShell) {
        authDom.appShell.classList.remove('hidden');
    }
}

function isAdminDashboardRoute() {
    return authHelpers.normalizePathname(window.location.pathname) === authConstants.ADMIN_DASHBOARD_PATH;
}

function navigateToAdminDashboard() {
    if (isAdminDashboardRoute()) {
        return;
    }
    window.location.assign(authConstants.ADMIN_DASHBOARD_PATH);
}

function navigateToEditor() {
    if (authHelpers.normalizePathname(window.location.pathname) === '/') {
        return;
    }
    window.location.assign('/');
}

function setAdminDashboardVisible(visible) {
    const showAdmin = visible === true;
    document.body.classList.toggle('admin-dashboard-active', showAdmin);
    if (!authDom.adminPanelBackdrop) {
        return;
    }
    authDom.adminPanelBackdrop.classList.toggle('hidden', !showAdmin);
}

function resetAdminDashboardScroll() {
    if (!isAdminDashboardRoute()) {
        return;
    }
    window.scrollTo(0, 0);
    if (authDom.adminPanelBackdrop) {
        authDom.adminPanelBackdrop.scrollTop = 0;
    }
    if (document.documentElement) {
        document.documentElement.scrollTop = 0;
    }
    if (document.body) {
        document.body.scrollTop = 0;
    }
}

function applyRouteViewMode() {
    const adminRoute = isAdminDashboardRoute();
    document.body.classList.toggle('admin-dashboard-route', adminRoute);
    if (!adminRoute) {
        setAdminDashboardVisible(false);
    }
}

function syncAdminDashboardRouteState() {
    if (!isAdminDashboardRoute()) {
        return;
    }
    if (!authState.currentUser || typeof authState.currentUser !== 'object') {
        return;
    }
    setAdminDashboardVisible(authHelpers.isAdminUser(authState.currentUser));
}

function applyCurrentUser(user) {
    if (!user || typeof user !== 'object') {
        authState.currentUser = null;
        if (authDom.userNameEl) authDom.userNameEl.textContent = 'User';
        if (authDom.userRoleEl) authDom.userRoleEl.textContent = 'USER';
        if (authDom.openAdminPanelBtn) authDom.openAdminPanelBtn.classList.add('hidden');
        if (authDom.editingOptionsSection) authDom.editingOptionsSection.classList.add('hidden');
        if (authDom.aiSettingsSection) authDom.aiSettingsSection.classList.add('hidden');
        if (authDom.managedSettingsNote) authDom.managedSettingsNote.classList.remove('hidden');
        if (isAdminDashboardRoute()) {
            setAdminDashboardVisible(false);
        }
        return;
    }

    authState.currentUser = user;
    if (authDom.userNameEl) {
        authDom.userNameEl.textContent = String(user.display_name || user.email || 'User');
    }
    const role = authHelpers.normalizeUserRole(user.role);
    if (authDom.userRoleEl) {
        authDom.userRoleEl.textContent = role;
    }
    if (authDom.openAdminPanelBtn) {
        authDom.openAdminPanelBtn.classList.toggle('hidden', role !== 'ADMIN' || isAdminDashboardRoute());
    }
    if (authDom.editingOptionsSection) authDom.editingOptionsSection.classList.add('hidden');
    if (authDom.aiSettingsSection) authDom.aiSettingsSection.classList.add('hidden');
    if (authDom.managedSettingsNote) authDom.managedSettingsNote.classList.remove('hidden');
    if (isAdminDashboardRoute()) {
        setAdminDashboardVisible(role === 'ADMIN');
    }
}

function renderTaskHistory() {
    if (!authDom.taskHistoryEl) {
        return;
    }
    if (!Array.isArray(authState.taskHistory) || authState.taskHistory.length === 0) {
        authDom.taskHistoryEl.innerHTML = '<p class="task-empty">No tasks yet. Upload a manuscript to start.</p>';
        return;
    }

    let html = '';
    authState.taskHistory.forEach((task) => {
        const taskId = String(task.id || '');
        const activeClass = taskId && taskId === authState.fileContent.taskId ? ' active' : '';
        const status = authHelpers.escapeHtml(String(task.status || 'UPLOADED'));
        const words = Number(task.word_count || 0);
        const sourceType = String(task.source_type || 'text').toUpperCase();
        html += `<div class="task-history-item${activeClass}" data-task-id="${authHelpers.escapeHtml(taskId)}">`;
        html += `<div class="task-history-title">${authHelpers.escapeHtml(String(task.file_name || 'Untitled manuscript'))}</div>`;
        html += `<div class="task-history-badges"><span class="task-history-badge">${authHelpers.escapeHtml(sourceType)}</span><span class="task-history-badge task-history-badge-status">${status}</span></div>`;
        html += `<div class="task-history-meta">${status} • ${words} words • ${authHelpers.escapeHtml(authHelpers.formatUnixTimestamp(task.updated_at))}</div>`;
        html += '</div>';
    });
    authDom.taskHistoryEl.innerHTML = html;

    authDom.taskHistoryEl.querySelectorAll('.task-history-item[data-task-id]').forEach((node) => {
        node.addEventListener('click', () => {
            const taskId = String(node.getAttribute('data-task-id') || '').trim();
            if (taskId) {
                loadTaskIntoEditor(taskId);
            }
        });
    });
}

function refreshTaskHistory() {
    if (typeof eel === 'undefined' || typeof eel.list_tasks !== 'function') {
        return;
    }
    eel.list_tasks(120)(function (response) {
        if (!response || !response.success) {
            return;
        }
        authState.taskHistory = Array.isArray(response.tasks) ? response.tasks : [];
        renderTaskHistory();
    });
}

function refreshRuntimeSettings(callback) {
    if (typeof eel === 'undefined' || typeof eel.get_runtime_settings !== 'function') {
        authState.runtimeManagedSettings = null;
        if (typeof callback === 'function') {
            callback(null);
        }
        return;
    }
    eel.get_runtime_settings()(function (response) {
        if (response && response.success && response.settings && typeof response.settings === 'object') {
            authState.runtimeManagedSettings = response.settings;
            if (typeof callback === 'function') {
                callback(authState.runtimeManagedSettings);
            }
            return;
        }
        authState.runtimeManagedSettings = null;
        if (typeof callback === 'function') {
            callback(null);
        }
    });
}

function buildProcessingOptionsFromRuntimeSettings() {
    const settings = authState.runtimeManagedSettings && typeof authState.runtimeManagedSettings === 'object'
        ? authState.runtimeManagedSettings
        : null;
    const editing = settings && settings.editing && typeof settings.editing === 'object' ? settings.editing : {};
    const onlineReferenceValidationEnabled = settings
        ? editing.online_reference_validation !== false
        : (authDom.onlineReferenceValidationInput ? authDom.onlineReferenceValidationInput.checked !== false : true);
    const defaults = {
        spelling: true,
        sentence_case: true,
        punctuation: true,
        chicago_style: true,
        cmos_strict_mode: true,
        online_reference_validation: onlineReferenceValidationEnabled,
        domain_profile: 'auto',
        custom_terms: [],
        journal_profile: authConstants.FIXED_JOURNAL_PROFILE,
        reference_profile: authConstants.FIXED_JOURNAL_PROFILE,
        ai: {
            enabled: true,
            provider: 'ollama',
            model: authConstants.DEFAULT_MODEL_BY_PROVIDER.ollama,
            ollama_host: 'http://localhost:11434',
            api_key: '',
            gemini_api_key: '',
            openrouter_api_key: '',
            ai_first_cmos: false,
            section_wise: true,
            section_threshold_chars: 12000,
            section_threshold_paragraphs: 90,
            section_chunk_chars: 5500,
            section_chunk_lines: 28,
            global_consistency_max_chars: 18000
        }
    };
    if (!settings) {
        return defaults;
    }
    const ai = settings.ai && typeof settings.ai === 'object' ? settings.ai : {};
    return {
        spelling: editing.spelling !== false,
        sentence_case: editing.sentence_case !== false,
        punctuation: editing.punctuation !== false,
        chicago_style: editing.chicago_style !== false,
        cmos_strict_mode: editing.cmos_strict_mode !== false,
        online_reference_validation: onlineReferenceValidationEnabled,
        domain_profile: String(editing.domain_profile || 'auto'),
        custom_terms: Array.isArray(editing.custom_terms) ? editing.custom_terms : [],
        journal_profile: authConstants.FIXED_JOURNAL_PROFILE,
        reference_profile: authConstants.FIXED_JOURNAL_PROFILE,
        ai: {
            enabled: ai.enabled !== false,
            provider: String(ai.provider || 'ollama'),
            model: String(ai.model || ''),
            ollama_host: String(ai.ollama_host || ''),
            api_key: String(ai.gemini_api_key || ''),
            gemini_api_key: String(ai.gemini_api_key || ''),
            openrouter_api_key: String(ai.openrouter_api_key || ''),
            ai_first_cmos: ai.ai_first_cmos === true,
            section_wise: ai.section_wise !== false,
            section_threshold_chars: Number(ai.section_threshold_chars || 12000),
            section_threshold_paragraphs: Number(ai.section_threshold_paragraphs || 90),
            section_chunk_chars: Number(ai.section_chunk_chars || 5500),
            section_chunk_lines: Number(ai.section_chunk_lines || 28),
            global_consistency_max_chars: Number(ai.global_consistency_max_chars || 18000)
        }
    };
}

function applyTaskDetailsToState(task) {
    if (!task || typeof task !== 'object') {
        return;
    }
    const reports = task.reports && typeof task.reports === 'object' ? task.reports : {};
    authState.fileContent.taskId = String(task.id || '');
    authState.fileContent.sourceType = String(task.source_type || 'text');
    authState.fileContent.sourceDocxBase64 = '';
    authState.fileContent.fileName = String(task.file_name || '');
    authState.fileContent.original = String(task.original_text || '');
    authState.fileContent.corrected = String(task.corrected_text || '');
    authState.fileContent.fullCorrectedText = String(task.full_corrected_text || '');
    authState.fileContent.correctedAnnotatedHtml = String(reports.corrected_annotated_html || '');
    authState.fileContent.redline = String(reports.redline_html || '');
    authState.fileContent.corrections = reports.corrections_report || null;
    authState.fileContent.nounReport = reports.noun_report || null;
    authState.fileContent.domainReport = reports.domain_report || null;
    authState.fileContent.journalProfileReport = reports.journal_profile_report || null;
    authState.fileContent.citationReferenceReport = reports.citation_reference_report || null;
    authState.fileContent.processingAudit = reports.processing_audit || null;
    authState.fileContent.groupDecisions = appAuth.preview.buildDefaultGroupDecisions();
    appAuth.syncWindowFileContent();

    const fileNameEl = document.getElementById('file-name');
    const wordCountEl = document.getElementById('word-count');
    if (fileNameEl) fileNameEl.textContent = authState.fileContent.fileName || 'No file selected';
    if (wordCountEl) wordCountEl.textContent = 'Words: ' + Number(task.word_count || 0);

    const processed = String(task.status || '').toUpperCase() === 'PROCESSED';
    if (authDom.saveCleanBtn) authDom.saveCleanBtn.disabled = !processed;
    if (authDom.saveHighlightBtn) authDom.saveHighlightBtn.disabled = !processed;
    appAuth.actions.refreshProcessButtonState();
    appAuth.actions.switch_tab(processed ? 'corrected' : 'original');
    renderTaskHistory();
    renderAdminDocxStructureSummary();
}

function loadTaskIntoEditor(taskId) {
    if (!taskId || typeof eel === 'undefined' || typeof eel.get_task !== 'function') {
        return;
    }
    appAuth.actions.setStatus('Loading task...', 'warning');
    eel.get_task(taskId)(function (response) {
        if (!response || !response.success || !response.task) {
            appAuth.actions.setStatus('Could not load selected task', 'error');
            return;
        }
        applyTaskDetailsToState(response.task);
        appAuth.actions.setStatus('Task loaded', 'success');
    });
}

function ensureGoogleSigninButton() {
    if (!window.google || !google.accounts || !google.accounts.id) {
        setLoginStatus('Google Sign-In script not ready. Retrying...', 'warning');
        setTimeout(ensureGoogleSigninButton, 500);
        return;
    }
    const clientId = window.__GOOGLE_CLIENT_ID__ || '';
    if (!clientId) {
        setLoginStatus('GOOGLE_CLIENT_ID is not configured on the server.', 'error');
        return;
    }
    google.accounts.id.initialize({
        client_id: clientId,
        callback: onGoogleCredentialResponse
    });
    const holder = document.getElementById('google-signin-button');
    if (!holder) {
        return;
    }
    holder.innerHTML = '';
    google.accounts.id.renderButton(holder, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'signin_with',
        width: 320
    });
    setLoginStatus('Please sign in to continue.', 'info');
}

function loadAuthConfigThenRenderLogin() {
    if (typeof eel === 'undefined' || typeof eel.auth_config !== 'function') {
        setLoginStatus('Cannot read auth configuration from server.', 'error');
        return;
    }
    eel.auth_config()(function (response) {
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Auth config unavailable';
            setLoginStatus(message, 'error');
            return;
        }
        window.__GOOGLE_CLIENT_ID__ = String(response.google_client_id || '');
        const domains = Array.isArray(response.allowed_domains) ? response.allowed_domains : [];
        if (authDom.loginDomainsEl && domains.length > 0) {
            authDom.loginDomainsEl.innerHTML = 'Allowed domains: ' + domains.map((domain) => `<code>${authHelpers.escapeHtml(String(domain))}</code>`).join(', ');
        }
        const localLoginEnabled = response.local_manual_login_enabled === true;
        if (authDom.localLoginBox) {
            authDom.localLoginBox.classList.toggle('hidden', !localLoginEnabled);
        }
        if (localLoginEnabled && authDom.localLoginUsernameInput) {
            const usernameHint = String(response.local_manual_login_username_hint || 'admin').trim() || 'admin';
            authDom.localLoginUsernameInput.value = usernameHint;
        }
        if (localLoginEnabled && authDom.localLoginHelp) {
            authDom.localLoginHelp.textContent = 'Local manual login is enabled for this machine only. Test credentials: admin / password.';
        }
        ensureGoogleSigninButton();
    });
}

function submitLocalLogin() {
    if (typeof eel === 'undefined' || typeof eel.auth_local_login !== 'function') {
        setLoginStatus('Local auth bridge unavailable.', 'error');
        return;
    }
    const username = authDom.localLoginUsernameInput ? String(authDom.localLoginUsernameInput.value || '').trim() : '';
    const password = authDom.localLoginPasswordInput ? String(authDom.localLoginPasswordInput.value || '') : '';
    if (!username || !password) {
        setLoginStatus('Enter local username and password.', 'warning');
        return;
    }
    if (authDom.localLoginBtn) {
        authDom.localLoginBtn.disabled = true;
    }
    setLoginStatus('Signing in locally...', 'warning');
    eel.auth_local_login(username, password)(function (authResponse) {
        if (authDom.localLoginBtn) {
            authDom.localLoginBtn.disabled = false;
        }
        if (!authResponse || !authResponse.success) {
            const message = authResponse && authResponse.error ? String(authResponse.error) : 'Local login failed';
            setLoginStatus(message, 'error');
            return;
        }
        applyCurrentUser(authResponse.user || null);
        showAppView();
        appAuth.actions.setStatus('Authenticated', 'success');
        if (isAdminDashboardRoute() && !authHelpers.isAdminUser(authState.currentUser)) {
            navigateToEditor();
            return;
        }
        applyRouteViewMode();
        refreshRuntimeSettings();
        appAuth.settings.maybeShowSetupWizardOnFirstRun();
        refreshTaskHistory();
        if (authHelpers.isAdminUser(authState.currentUser)) {
            if (isAdminDashboardRoute()) {
                openAdminPanel();
            } else {
                refreshAdminUsers();
                refreshAdminAudit();
            }
        }
    });
}

function onGoogleCredentialResponse(response) {
    const credential = response && response.credential ? String(response.credential) : '';
    if (!credential) {
        setLoginStatus('Google sign-in failed: missing credential.', 'error');
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.auth_google_login !== 'function') {
        setLoginStatus('Auth bridge unavailable.', 'error');
        return;
    }
    setLoginStatus('Signing in...', 'warning');
    eel.auth_google_login(credential)(function (authResponse) {
        if (!authResponse || !authResponse.success) {
            const message = authResponse && authResponse.error ? String(authResponse.error) : 'Login failed';
            setLoginStatus(message, 'error');
            return;
        }
        applyCurrentUser(authResponse.user || null);
        showAppView();
        appAuth.actions.setStatus('Authenticated', 'success');
        if (isAdminDashboardRoute() && !authHelpers.isAdminUser(authState.currentUser)) {
            navigateToEditor();
            return;
        }
        applyRouteViewMode();
        refreshRuntimeSettings();
        appAuth.settings.maybeShowSetupWizardOnFirstRun();
        refreshTaskHistory();
        if (authHelpers.isAdminUser(authState.currentUser)) {
            if (isAdminDashboardRoute()) {
                openAdminPanel();
            } else {
                refreshAdminUsers();
                refreshAdminAudit();
            }
        }
    });
}

function checkAuthenticatedUser() {
    if (typeof eel === 'undefined' || typeof eel.auth_me !== 'function') {
        showLoginView();
        setLoginStatus('Auth bridge unavailable.', 'error');
        return;
    }
    eel.auth_me()(function (response) {
        if (!response || !response.success || !response.user) {
            applyCurrentUser(null);
            showLoginView();
            loadAuthConfigThenRenderLogin();
            return;
        }
        applyCurrentUser(response.user);
        showAppView();
        if (isAdminDashboardRoute() && !authHelpers.isAdminUser(authState.currentUser)) {
            navigateToEditor();
            return;
        }
        applyRouteViewMode();
        refreshRuntimeSettings();
        appAuth.settings.maybeShowSetupWizardOnFirstRun();
        refreshTaskHistory();
        if (authHelpers.isAdminUser(authState.currentUser)) {
            if (isAdminDashboardRoute()) {
                openAdminPanel();
            } else {
                refreshAdminUsers();
                refreshAdminAudit();
            }
        }
    });
}

function logoutCurrentUser() {
    if (typeof eel === 'undefined' || typeof eel.auth_logout !== 'function') {
        return;
    }
    eel.auth_logout()(function () {
        applyCurrentUser(null);
        appAuth.actions.clear_all();
        showLoginView();
        loadAuthConfigThenRenderLogin();
    });
}

function renderAdminUsers() {
    if (!authDom.adminUsersBody) {
        return;
    }
    if (!Array.isArray(authState.adminUsers) || authState.adminUsers.length === 0) {
        authDom.adminUsersBody.innerHTML = '<tr><td colspan="4">No users found.</td></tr>';
        return;
    }
    let html = '';
    authState.adminUsers.forEach((user) => {
        const userId = authHelpers.escapeHtml(String(user.id || ''));
        const status = String(user.status || 'ACTIVE').toUpperCase();
        const isActive = status === 'ACTIVE';
        const role = authHelpers.escapeHtml(String(user.role || 'USER'));
        const email = authHelpers.escapeHtml(String(user.email || ''));
        const statusClass = isActive ? 'active' : 'inactive';
        const actionLabel = isActive ? 'Deactivate' : 'Activate';
        const nextStatus = isActive ? 'INACTIVE' : 'ACTIVE';
        html += '<tr>';
        html += `<td>${email}<br><small>${authHelpers.escapeHtml(String(user.display_name || ''))}</small></td>`;
        html += `<td>${role}</td>`;
        html += `<td><span class="status-pill ${statusClass}">${authHelpers.escapeHtml(status)}</span></td>`;
        html += `<td><button class="btn-secondary btn-small" data-user-id="${userId}" data-next-status="${nextStatus}">${actionLabel}</button></td>`;
        html += '</tr>';
    });
    authDom.adminUsersBody.innerHTML = html;
    authDom.adminUsersBody.querySelectorAll('button[data-user-id][data-next-status]').forEach((button) => {
        button.addEventListener('click', () => {
            const userId = String(button.getAttribute('data-user-id') || '').trim();
            const nextStatus = String(button.getAttribute('data-next-status') || '').trim();
            if (userId && nextStatus) {
                updateAdminUserStatus(userId, nextStatus);
            }
        });
    });
}

function renderAdminAudit() {
    if (!authDom.adminAuditBody) {
        return;
    }
    if (!Array.isArray(authState.adminEvents) || authState.adminEvents.length === 0) {
        authDom.adminAuditBody.innerHTML = '<tr><td colspan="4">No events found.</td></tr>';
        return;
    }
    let html = '';
    authState.adminEvents.forEach((event) => {
        html += '<tr>';
        html += `<td>${authHelpers.escapeHtml(authHelpers.formatUnixTimestamp(event.created_at))}</td>`;
        html += `<td>${authHelpers.escapeHtml(String(event.actor_email || '-'))}</td>`;
        html += `<td>${authHelpers.escapeHtml(String(event.event_type || 'unknown'))}</td>`;
        html += `<td>${authHelpers.escapeHtml(String(event.target_email || '-'))}</td>`;
        html += '</tr>';
    });
    authDom.adminAuditBody.innerHTML = html;
}

function renderDocxStructureSummary(docxPackageFeatures, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const cardClass = settings.cardClass || 'docx-card';
    const titleClass = settings.titleClass || 'docx-title';
    const summaryClass = settings.summaryClass || 'docx-summary';
    const gridClass = settings.gridClass || 'docx-grid';
    const itemClass = settings.itemClass || 'docx-item';
    const noteClass = settings.noteClass || 'docx-note';
    const okClass = settings.okClass || 'docx-ok';
    const emptyMessage = settings.emptyMessage || 'No DOCX structure summary is available for this task yet.';
    const title = settings.title || 'DOCX Structure';
    const sourceLabel = settings.sourceLabel ? `<div class="${summaryClass}">${authHelpers.escapeHtml(settings.sourceLabel)}</div>` : '';
    const safe = docxPackageFeatures && typeof docxPackageFeatures === 'object' ? docxPackageFeatures : null;

    if (!safe) {
        return `<section class="${cardClass}"><div class="${titleClass}">${authHelpers.escapeHtml(title)}</div><div class="${okClass}">${authHelpers.escapeHtml(emptyMessage)}</div></section>`;
    }

    const featureItems = [
        ['Comments', Number(safe.comments || 0)],
        ['Footnotes', Number(safe.footnotes || 0)],
        ['Endnotes', Number(safe.endnotes || 0)],
        ['Textboxes', Number(safe.textboxes || 0)]
    ];
    const presentFeatures = featureItems.filter(([, count]) => count > 0);

    let html = `<section class="${cardClass}">`;
    html += `<div class="${titleClass}">${authHelpers.escapeHtml(title)}</div>`;
    html += sourceLabel;
    html += `<div class="${summaryClass}">Preservation mode: <strong>${authHelpers.escapeHtml(String(safe.preservation_mode || 'template_copy_required').replaceAll('_', ' '))}</strong></div>`;
    html += `<div class="${gridClass}">`;
    featureItems.forEach(([label, count]) => {
        html += `<div class="${itemClass}"><span>${authHelpers.escapeHtml(label)}</span><strong>${count}</strong></div>`;
    });
    html += '</div>';
    html += presentFeatures.length > 0
        ? `<div class="${noteClass}">This manuscript contains special DOCX structures. Export preserves them, but editing remains body-text-first for comments, footnotes, and endnotes.</div>`
        : `<div class="${okClass}">No special DOCX structures detected in this manuscript.</div>`;
    html += '</section>';
    return html;
}

function renderAdminDocxStructureSummary() {
    if (!authDom.adminDocxStructureSummary) {
        return;
    }
    const safeAudit = authState.fileContent.processingAudit && typeof authState.fileContent.processingAudit === 'object'
        ? authState.fileContent.processingAudit
        : null;
    const summary = safeAudit && safeAudit.summary && typeof safeAudit.summary === 'object' ? safeAudit.summary : {};
    const docxPackageFeatures = summary.docx_package_features && typeof summary.docx_package_features === 'object'
        ? summary.docx_package_features
        : null;
    const sourceLabel = authState.fileContent.fileName
        ? `Loaded task: ${authState.fileContent.fileName}${authState.fileContent.sourceType ? ` • ${String(authState.fileContent.sourceType).toUpperCase()}` : ''}`
        : '';
    authDom.adminDocxStructureSummary.innerHTML = renderDocxStructureSummary(docxPackageFeatures, {
        title: 'DOCX Structure',
        sourceLabel,
        emptyMessage: 'Select a processed task from the editor history to inspect its DOCX structure summary here.'
    });
}

function setElementVisible(el, visible) {
    if (!el) {
        return;
    }
    el.classList.toggle('hidden', visible === false);
}

function bindPasswordToggle(inputEl, toggleBtn, labels) {
    if (!inputEl || !toggleBtn) {
        return;
    }
    const safeLabels = labels && typeof labels === 'object' ? labels : {};
    const showLabel = String(safeLabels.show || 'Show');
    const hideLabel = String(safeLabels.hide || 'Hide');
    const showAria = String(safeLabels.showAria || 'Show value');
    const hideAria = String(safeLabels.hideAria || 'Hide value');

    const update = () => {
        const visible = inputEl.type === 'text';
        toggleBtn.textContent = visible ? hideLabel : showLabel;
        toggleBtn.setAttribute('aria-label', visible ? hideAria : showAria);
        toggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    };

    toggleBtn.addEventListener('click', () => {
        inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
        update();
    });

    update();
}

function getModelSuggestionsForProvider(provider, ollamaModels) {
    const selected = String(provider || '').trim().toLowerCase();
    if (selected === 'gemini') return ['gemini-1.5-flash', 'gemini-1.5-pro'];
    if (selected === 'openrouter') return ['openrouter/auto', 'openai/gpt-5.4', 'google/gemini-2.5-pro', 'anthropic/claude-sonnet-4'];
    if (selected === 'agent_router') return ['openrouter/auto', 'openai/gpt-5.4', 'google/gemini-2.5-pro'];
    return Array.isArray(ollamaModels) && ollamaModels.length > 0
        ? ollamaModels
        : ['llama3.1', 'llama3.1:latest', 'qwen2.5:7b', 'mistral:7b'];
}

function applyDatalistOptions(datalistEl, values) {
    if (!datalistEl) {
        return;
    }
    const options = authHelpers.uniqueNonEmpty(values);
    datalistEl.innerHTML = options.map((value) => `<option value="${authHelpers.escapeHtml(value)}"></option>`).join('');
}

function loadAdminGlobalOllamaModels(forceRefresh) {
    if (!authDom.adminSettingOllamaHost || typeof eel === 'undefined' || typeof eel.get_ollama_models !== 'function') {
        return;
    }
    const host = String(authDom.adminSettingOllamaHost.value || '').trim();
    if (!forceRefresh && host && host === authState.adminGlobalOllamaModelHostCache && authState.adminGlobalOllamaModelCache.length > 0) {
        return;
    }
    eel.get_ollama_models(host)(function (response) {
        if (!response || !response.success) {
            return;
        }
        authState.adminGlobalOllamaModelHostCache = host;
        authState.adminGlobalOllamaModelCache = authHelpers.uniqueNonEmpty(Array.isArray(response.models) ? response.models : []);
        updateAdminGlobalAiProviderUI(false);
        updateAdminAiValidationHint();
    });
}

function updateAdminGlobalAiProviderUI(forceDefaultModel) {
    if (!authDom.adminSettingAiProvider || !authDom.adminSettingAiModel) {
        return;
    }
    const provider = String(authDom.adminSettingAiProvider.value || '').toLowerCase();
    const usesOpenrouterKey = provider === 'openrouter' || provider === 'agent_router';
    const usesGeminiKey = provider === 'gemini';
    if (authDom.adminSettingGeminiKey) authDom.adminSettingGeminiKey.disabled = !usesGeminiKey;
    if (authDom.adminSettingOpenrouterKey) authDom.adminSettingOpenrouterKey.disabled = !usesOpenrouterKey;
    if (authDom.adminSettingOllamaHost) authDom.adminSettingOllamaHost.disabled = provider !== 'ollama';
    setElementVisible(authDom.adminSettingGeminiKey, usesGeminiKey);
    setElementVisible(authDom.adminSettingOpenrouterKey, usesOpenrouterKey);
    setElementVisible(authDom.adminSettingOllamaHost, provider === 'ollama');

    authDom.adminSettingAiModel.placeholder = provider === 'gemini'
        ? 'gemini-1.5-flash'
        : provider === 'ollama'
            ? 'llama3.1'
            : 'openrouter/auto';

    if (provider === 'ollama') {
        loadAdminGlobalOllamaModels(false);
    }
    applyDatalistOptions(
        authDom.adminSettingAiModelList,
        getModelSuggestionsForProvider(provider, provider === 'ollama' ? authState.adminGlobalOllamaModelCache : [])
    );

    if (forceDefaultModel || !String(authDom.adminSettingAiModel.value || '').trim()) {
        authDom.adminSettingAiModel.value = authConstants.DEFAULT_MODEL_BY_PROVIDER[provider] || authConstants.DEFAULT_MODEL_BY_PROVIDER.ollama;
    }
}

function getAdminProviderEndpoint(provider, fallbackHost) {
    const selected = String(provider || '').trim().toLowerCase();
    if (selected === 'ollama') return String(fallbackHost || '').trim() || 'http://localhost:11434';
    if (selected === 'gemini') return 'https://generativelanguage.googleapis.com';
    return 'https://openrouter.ai/api/v1/chat/completions';
}

function applyAdminGlobalSettingsForm(settings) {
    const safe = settings && typeof settings === 'object' ? settings : {};
    const editing = safe.editing && typeof safe.editing === 'object' ? safe.editing : {};
    const ai = safe.ai && typeof safe.ai === 'object' ? safe.ai : {};
    if (authDom.adminSettingSpelling) authDom.adminSettingSpelling.checked = editing.spelling !== false;
    if (authDom.adminSettingSentenceCase) authDom.adminSettingSentenceCase.checked = editing.sentence_case !== false;
    if (authDom.adminSettingPunctuation) authDom.adminSettingPunctuation.checked = editing.punctuation !== false;
    if (authDom.adminSettingChicagoStyle) authDom.adminSettingChicagoStyle.checked = editing.chicago_style !== false;
    if (authDom.adminSettingCmosStrict) authDom.adminSettingCmosStrict.checked = editing.cmos_strict_mode !== false;
    if (authDom.adminSettingOnlineReferenceValidation) authDom.adminSettingOnlineReferenceValidation.checked = editing.online_reference_validation !== false;
    if (authDom.adminSettingDomainProfile) authDom.adminSettingDomainProfile.value = String(editing.domain_profile || 'auto');
    if (authDom.adminSettingCustomTerms) {
        const terms = Array.isArray(editing.custom_terms) ? editing.custom_terms : [];
        authDom.adminSettingCustomTerms.value = appAuth.preview.normalizeCustomTermsText(terms.join('\n'));
    }
    if (authDom.adminSettingAiEnabled) authDom.adminSettingAiEnabled.checked = ai.enabled !== false;
    if (authDom.adminSettingAiFirstCmos) authDom.adminSettingAiFirstCmos.checked = ai.ai_first_cmos === true;
    if (authDom.adminSettingAiProvider) authDom.adminSettingAiProvider.value = String(ai.provider || 'ollama');
    if (authDom.adminSettingAiModel) authDom.adminSettingAiModel.value = String(ai.model || '');
    if (authDom.adminSettingOllamaHost) authDom.adminSettingOllamaHost.value = String(ai.ollama_host || 'http://localhost:11434');
    if (authDom.adminSettingGeminiKey) authDom.adminSettingGeminiKey.value = String(ai.gemini_api_key || '');
    if (authDom.adminSettingOpenrouterKey) authDom.adminSettingOpenrouterKey.value = String(ai.openrouter_api_key || '');
    if (authDom.adminSettingSectionWise) authDom.adminSettingSectionWise.checked = ai.section_wise !== false;
    if (authDom.adminSettingSectionThresholdChars) authDom.adminSettingSectionThresholdChars.value = Number(ai.section_threshold_chars || 12000);
    if (authDom.adminSettingSectionThresholdParagraphs) authDom.adminSettingSectionThresholdParagraphs.value = Number(ai.section_threshold_paragraphs || 90);
    if (authDom.adminSettingSectionChunkChars) authDom.adminSettingSectionChunkChars.value = Number(ai.section_chunk_chars || 5500);
    if (authDom.adminSettingSectionChunkLines) authDom.adminSettingSectionChunkLines.value = Number(ai.section_chunk_lines || 28);
    if (authDom.adminSettingGlobalConsistencyMaxChars) authDom.adminSettingGlobalConsistencyMaxChars.value = Number(ai.global_consistency_max_chars || 18000);
    updateAdminGlobalAiProviderUI(false);
}

function collectAdminGlobalSettingsForm() {
    return {
        editing: {
            spelling: authDom.adminSettingSpelling ? authDom.adminSettingSpelling.checked : true,
            sentence_case: authDom.adminSettingSentenceCase ? authDom.adminSettingSentenceCase.checked : true,
            punctuation: authDom.adminSettingPunctuation ? authDom.adminSettingPunctuation.checked : true,
            chicago_style: authDom.adminSettingChicagoStyle ? authDom.adminSettingChicagoStyle.checked : true,
            cmos_strict_mode: authDom.adminSettingCmosStrict ? authDom.adminSettingCmosStrict.checked : true,
            online_reference_validation: authDom.adminSettingOnlineReferenceValidation ? authDom.adminSettingOnlineReferenceValidation.checked : true,
            domain_profile: authDom.adminSettingDomainProfile ? String(authDom.adminSettingDomainProfile.value || 'auto') : 'auto',
            custom_terms: authDom.adminSettingCustomTerms ? appAuth.preview.parseCustomTerms(authDom.adminSettingCustomTerms.value) : []
        },
        ai: {
            enabled: authDom.adminSettingAiEnabled ? authDom.adminSettingAiEnabled.checked : true,
            ai_first_cmos: authDom.adminSettingAiFirstCmos ? authDom.adminSettingAiFirstCmos.checked : false,
            provider: authDom.adminSettingAiProvider ? String(authDom.adminSettingAiProvider.value || 'ollama') : 'ollama',
            model: authDom.adminSettingAiModel ? String(authDom.adminSettingAiModel.value || '').trim() : '',
            ollama_host: authDom.adminSettingOllamaHost ? String(authDom.adminSettingOllamaHost.value || '').trim() : '',
            gemini_api_key: authDom.adminSettingGeminiKey ? String(authDom.adminSettingGeminiKey.value || '').trim() : '',
            openrouter_api_key: authDom.adminSettingOpenrouterKey ? String(authDom.adminSettingOpenrouterKey.value || '').trim() : '',
            section_wise: authDom.adminSettingSectionWise ? authDom.adminSettingSectionWise.checked : true,
            section_threshold_chars: authHelpers.clampInt(authDom.adminSettingSectionThresholdChars ? authDom.adminSettingSectionThresholdChars.value : 12000, 4000, 120000, 12000),
            section_threshold_paragraphs: authHelpers.clampInt(authDom.adminSettingSectionThresholdParagraphs ? authDom.adminSettingSectionThresholdParagraphs.value : 90, 20, 1000, 90),
            section_chunk_chars: authHelpers.clampInt(authDom.adminSettingSectionChunkChars ? authDom.adminSettingSectionChunkChars.value : 5500, 1800, 30000, 5500),
            section_chunk_lines: authHelpers.clampInt(authDom.adminSettingSectionChunkLines ? authDom.adminSettingSectionChunkLines.value : 28, 8, 200, 28),
            global_consistency_max_chars: authHelpers.clampInt(authDom.adminSettingGlobalConsistencyMaxChars ? authDom.adminSettingGlobalConsistencyMaxChars.value : 18000, 6000, 120000, 18000)
        }
    };
}

function loadAdminGlobalSettings() {
    if (typeof eel === 'undefined' || typeof eel.admin_get_global_settings !== 'function') {
        return;
    }
    if (authDom.adminGlobalSettingsStatus) {
        authDom.adminGlobalSettingsStatus.textContent = 'Loading global settings...';
        authDom.adminGlobalSettingsStatus.style.color = '#ffd58d';
    }
    eel.admin_get_global_settings()(function (response) {
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Could not load global settings';
            if (authDom.adminGlobalSettingsStatus) {
                authDom.adminGlobalSettingsStatus.textContent = message;
                authDom.adminGlobalSettingsStatus.style.color = '#ffb8c2';
            }
            return;
        }
        applyAdminGlobalSettingsForm(response.settings || {});
        if (authDom.adminGlobalSettingsStatus) {
            authDom.adminGlobalSettingsStatus.textContent = 'Global settings loaded.';
            authDom.adminGlobalSettingsStatus.style.color = '#a9f2d3';
        }
    });
}

function saveAdminGlobalSettings() {
    if (typeof eel === 'undefined' || typeof eel.admin_update_global_settings !== 'function') {
        return;
    }
    const settings = collectAdminGlobalSettingsForm();
    if (authDom.adminGlobalSettingsStatus) {
        authDom.adminGlobalSettingsStatus.textContent = 'Saving global settings...';
        authDom.adminGlobalSettingsStatus.style.color = '#ffd58d';
    }
    if (authDom.adminSaveGlobalSettingsBtn) {
        authDom.adminSaveGlobalSettingsBtn.disabled = true;
    }
    eel.admin_update_global_settings(settings)(function (response) {
        if (authDom.adminSaveGlobalSettingsBtn) {
            authDom.adminSaveGlobalSettingsBtn.disabled = false;
        }
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Could not save global settings';
            if (authDom.adminGlobalSettingsStatus) {
                authDom.adminGlobalSettingsStatus.textContent = message;
                authDom.adminGlobalSettingsStatus.style.color = '#ffb8c2';
            }
            return;
        }
        authState.runtimeManagedSettings = response.settings || authState.runtimeManagedSettings;
        if (authDom.adminGlobalSettingsStatus) {
            authDom.adminGlobalSettingsStatus.textContent = 'Global settings saved. New processing jobs now use this config.';
            authDom.adminGlobalSettingsStatus.style.color = '#a9f2d3';
        }
    });
}

function refreshAdminUsers() {
    if (!authState.currentUser || String(authState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.admin_list_users !== 'function') {
        return;
    }
    eel.admin_list_users(300)(function (response) {
        if (!response || !response.success) {
            return;
        }
        authState.adminUsers = Array.isArray(response.users) ? response.users : [];
        renderAdminUsers();
    });
}

function refreshAdminAudit() {
    if (!authState.currentUser || String(authState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.admin_list_audit_events !== 'function') {
        return;
    }
    eel.admin_list_audit_events({ limit: 300 })(function (response) {
        if (!response || !response.success) {
            return;
        }
        authState.adminEvents = Array.isArray(response.events) ? response.events : [];
        renderAdminAudit();
    });
}

function updateAdminUserStatus(userId, nextStatus) {
    if (typeof eel === 'undefined' || typeof eel.admin_set_user_status !== 'function') {
        return;
    }
    eel.admin_set_user_status(userId, nextStatus)(function (response) {
        if (!response || !response.success) {
            alert(response && response.error ? String(response.error) : 'Could not update user status');
            return;
        }
        refreshAdminUsers();
        refreshAdminAudit();
    });
}

function updateAdminAiValidationHint() {
    if (!authDom.adminAiProviderSelect || !authDom.adminAiModelInput || !authDom.adminAiKeyInput || !authDom.adminAiOllamaHostInput) {
        return;
    }
    const provider = String(authDom.adminAiProviderSelect.value || '').toLowerCase();
    const usesRemoteKey = provider === 'openrouter' || provider === 'agent_router' || provider === 'gemini';
    authDom.adminAiKeyInput.disabled = !usesRemoteKey;
    authDom.adminAiOllamaHostInput.readOnly = provider !== 'ollama';
    authDom.adminAiOllamaHostInput.value = getAdminProviderEndpoint(provider, authDom.adminAiOllamaHostInput.value);
    authDom.adminAiOllamaHostInput.placeholder = provider === 'ollama' ? 'Ollama host' : 'Provider endpoint';
    authDom.adminAiModelInput.placeholder = provider === 'gemini'
        ? 'gemini-1.5-flash'
        : provider === 'ollama'
            ? 'llama3.1'
            : 'openrouter/auto';
    applyDatalistOptions(
        authDom.adminAiModelList,
        getModelSuggestionsForProvider(provider, provider === 'ollama' ? authState.adminGlobalOllamaModelCache : [])
    );
    if (!String(authDom.adminAiModelInput.value || '').trim()) {
        authDom.adminAiModelInput.value = authConstants.DEFAULT_MODEL_BY_PROVIDER[provider] || authConstants.DEFAULT_MODEL_BY_PROVIDER.openrouter;
    }
}

function validateAdminAiProvider() {
    if (!authDom.adminAiProviderSelect || !authDom.adminAiModelInput || !authDom.adminAiKeyInput || !authDom.adminAiOllamaHostInput) {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.admin_validate_ai_provider !== 'function') {
        return;
    }
    const payload = {
        provider: String(authDom.adminAiProviderSelect.value || '').trim(),
        model: String(authDom.adminAiModelInput.value || '').trim(),
        api_key: String(authDom.adminAiKeyInput.value || '').trim(),
        ollama_host: String(authDom.adminAiOllamaHostInput.value || '').trim()
    };
    if (authDom.adminAiValidationResult) {
        authDom.adminAiValidationResult.textContent = 'Checking provider...';
        authDom.adminAiValidationResult.style.color = '#ffd58d';
    }
    if (authDom.adminValidateAiBtn) {
        authDom.adminValidateAiBtn.disabled = true;
    }
    eel.admin_validate_ai_provider(payload)(function (response) {
        if (authDom.adminValidateAiBtn) {
            authDom.adminValidateAiBtn.disabled = false;
        }
        if (!authDom.adminAiValidationResult) {
            return;
        }
        if (!response || !response.success) {
            authDom.adminAiValidationResult.textContent = response && response.error ? String(response.error) : 'Validation failed';
            authDom.adminAiValidationResult.style.color = '#ffb8c2';
            return;
        }
        const ok = response.valid === true;
        authDom.adminAiValidationResult.textContent = String(response.message || (ok ? 'Provider is reachable.' : 'Provider check failed.'));
        authDom.adminAiValidationResult.style.color = ok ? '#a9f2d3' : '#ffb8c2';
    });
}

function openAdminPanel() {
    if (!isAdminDashboardRoute()) {
        navigateToAdminDashboard();
        return;
    }
    applyRouteViewMode();
    setAdminDashboardVisible(true);
    if (!authDom.adminPanelBackdrop) {
        return;
    }
    if (authDom.adminAiProviderSelect && authDom.aiProvider) {
        authDom.adminAiProviderSelect.value = String(authDom.aiProvider.value || 'openrouter');
    }
    if (authDom.adminAiModelInput) {
        authDom.adminAiModelInput.value = appAuth.settings.getCurrentAiModel();
    }
    if (authDom.adminAiOllamaHostInput && authDom.ollamaHostInput) {
        authDom.adminAiOllamaHostInput.value = String(authDom.ollamaHostInput.value || 'http://localhost:11434');
    }
    updateAdminGlobalAiProviderUI(false);
    updateAdminAiValidationHint();
    if (authDom.adminAiValidationResult) {
        authDom.adminAiValidationResult.textContent = 'Run a provider check from server runtime.';
        authDom.adminAiValidationResult.style.color = '#a8bddf';
    }
    loadAdminGlobalSettings();
    refreshAdminUsers();
    refreshAdminAudit();
    renderAdminDocxStructureSummary();
    resetAdminDashboardScroll();
}

function closeAdminPanel() {
    if (isAdminDashboardRoute()) {
        navigateToEditor();
        return;
    }
    setAdminDashboardVisible(false);
}

appAuth.authAdmin = {
    setLoginStatus,
    showLoginView,
    showAppView,
    isAdminDashboardRoute,
    navigateToAdminDashboard,
    navigateToEditor,
    setAdminDashboardVisible,
    resetAdminDashboardScroll,
    applyRouteViewMode,
    syncAdminDashboardRouteState,
    applyCurrentUser,
    renderTaskHistory,
    refreshTaskHistory,
    refreshRuntimeSettings,
    buildProcessingOptionsFromRuntimeSettings,
    applyTaskDetailsToState,
    loadTaskIntoEditor,
    ensureGoogleSigninButton,
    loadAuthConfigThenRenderLogin,
    onGoogleCredentialResponse,
    checkAuthenticatedUser,
    logoutCurrentUser,
    renderAdminUsers,
    renderAdminAudit,
    renderDocxStructureSummary,
    renderAdminDocxStructureSummary,
    setElementVisible,
    bindPasswordToggle,
    getModelSuggestionsForProvider,
    applyDatalistOptions,
    loadAdminGlobalOllamaModels,
    updateAdminGlobalAiProviderUI,
    getAdminProviderEndpoint,
    applyAdminGlobalSettingsForm,
    collectAdminGlobalSettingsForm,
    loadAdminGlobalSettings,
    saveAdminGlobalSettings,
    refreshAdminUsers,
    refreshAdminAudit,
    updateAdminUserStatus,
    updateAdminAiValidationHint,
    validateAdminAiProvider,
    openAdminPanel,
    closeAdminPanel,
    submitLocalLogin
};

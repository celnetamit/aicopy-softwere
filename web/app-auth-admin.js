const appAuth = window.ManuscriptEditorApp;
const authState = appAuth.state;
const authDom = appAuth.dom;
const authHelpers = appAuth.helpers;
const authConstants = appAuth.constants;

function getApiClient() {
    return window.ManuscriptApi && typeof window.ManuscriptApi === 'object'
        ? window.ManuscriptApi
        : null;
}

function handleApiPromise(promise, callback) {
    return Promise.resolve(promise)
        .then((response) => {
            if (typeof callback === 'function') {
                callback(response);
            }
            return response;
        })
        .catch((err) => {
            const response = {
                success: false,
                error: String(err && err.message ? err.message : err)
            };
            if (typeof callback === 'function') {
                callback(response);
            }
            return response;
        });
}

function callApiOrEel(apiInvoker, eelMethod, eelArgs, callback) {
    const api = getApiClient();
    if (api && typeof apiInvoker === 'function') {
        const promise = apiInvoker(api);
        if (promise) {
            handleApiPromise(promise, callback);
            return true;
        }
    }
    const eelBridge = typeof eel !== 'undefined' && eel ? eel : null;
    if (eelBridge && typeof eelBridge[eelMethod] === 'function') {
        eelBridge[eelMethod].apply(eelBridge, eelArgs || [])(callback);
        return true;
    }
    return false;
}

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

function isTasksDashboardRoute() {
    return authHelpers.normalizePathname(window.location.pathname) === authConstants.TASKS_DASHBOARD_PATH;
}

function getCurrentTaskRouteId() {
    return authHelpers.getTaskRouteIdFromPathname(window.location.pathname);
}

function isTaskDetailRoute() {
    return !!getCurrentTaskRouteId();
}

function navigateToAdminDashboard() {
    if (isAdminDashboardRoute()) {
        return;
    }
    window.location.assign(authConstants.ADMIN_DASHBOARD_PATH);
}

function navigateToTasksDashboard() {
    if (isTasksDashboardRoute()) {
        return;
    }
    window.location.assign(authConstants.TASKS_DASHBOARD_PATH);
}

function navigateToTask(taskId) {
    const safeTaskId = String(taskId || '').trim();
    if (!safeTaskId) {
        navigateToTasksDashboard();
        return;
    }
    const target = `${authConstants.TASKS_DASHBOARD_PATH}/${encodeURIComponent(safeTaskId)}`;
    if (authHelpers.normalizePathname(window.location.pathname) === target) {
        return;
    }
    window.location.assign(target);
}

function navigateToEditor() {
    if (String(authState.fileContent.taskId || '').trim()) {
        navigateToTask(authState.fileContent.taskId);
        return;
    }
    navigateToTasksDashboard();
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
    const dashboardRoute = isTasksDashboardRoute();
    const detailRoute = isTaskDetailRoute();
    document.body.classList.toggle('admin-dashboard-route', adminRoute);
    document.body.classList.toggle('tasks-dashboard-route', dashboardRoute);
    document.body.classList.toggle('task-detail-route', detailRoute);
    if (!adminRoute) {
        setAdminDashboardVisible(false);
    }
    if (authDom.openTasksDashboardBtn) {
        authDom.openTasksDashboardBtn.classList.toggle('hidden', dashboardRoute || adminRoute);
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
    const tasksPage = appAuth.pages && appAuth.pages.tasks;
    if (tasksPage && typeof tasksPage.renderTaskHistory === 'function') {
        tasksPage.renderTaskHistory();
    }
}

function refreshTaskHistory() {
    const called = callApiOrEel(
        (api) => api.tasks && typeof api.tasks.list === 'function' ? api.tasks.list(120) : null,
        'list_tasks',
        [120],
        function (response) {
            if (!response || !response.success) {
                return;
            }
            authState.taskHistory = Array.isArray(response.tasks) ? response.tasks : [];
            renderTaskHistory();
        }
    );
    if (!called) {
        return;
    }
}

function refreshRuntimeSettings(callback) {
    const runtimeModule = appAuth.adminRuntime || {};
    if (typeof runtimeModule.refreshRuntimeSettings === 'function') {
        return runtimeModule.refreshRuntimeSettings(callback);
    }
    authState.runtimeManagedSettings = null;
    if (typeof callback === 'function') {
        callback(null);
    }
    return undefined;
}

function buildProcessingOptionsFromRuntimeSettings() {
    const runtimeModule = appAuth.adminRuntime || {};
    if (typeof runtimeModule.buildProcessingOptionsFromRuntimeSettings === 'function') {
        return runtimeModule.buildProcessingOptionsFromRuntimeSettings();
    }
    return {};
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
    authState.fileContent.proseOnlyDiff = String(reports.prose_only_diff || '');
    authState.fileContent.strictCmosIssues = reports.strict_cmos_issues || null;
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
    const processingModeEl = document.getElementById('processing-mode-indicator');
    if (fileNameEl) fileNameEl.textContent = authState.fileContent.fileName || 'No file selected';
    if (wordCountEl) wordCountEl.textContent = 'Words: ' + Number(task.word_count || 0);
    if (processingModeEl) {
        const note = String(reports.processing_note || '').toLowerCase();
        const audit = reports.processing_audit && typeof reports.processing_audit === 'object' ? reports.processing_audit : {};
        const summary = audit.summary && typeof audit.summary === 'object' ? audit.summary : {};
        const mode = String(audit.mode || '').toLowerCase();
        const finalDecision = String(((summary.final_selection || {}).decision) || '').toLowerCase();
        const isFallback = note.includes('fallback') || finalDecision.includes('fallback') || mode === 'rule_only';
        const isAi = mode === 'full' || mode === 'sectioned';
        processingModeEl.classList.remove('mode-ai', 'mode-fallback', 'mode-unknown');
        if (isFallback) {
            processingModeEl.classList.add('mode-fallback');
            processingModeEl.textContent = 'Mode: Fallback';
        } else if (isAi) {
            processingModeEl.classList.add('mode-ai');
            processingModeEl.textContent = 'Mode: AI';
        } else {
            processingModeEl.classList.add('mode-unknown');
            processingModeEl.textContent = 'Mode: Unknown';
        }
    }

    const processed = String(task.status || '').toUpperCase() === 'PROCESSED';
    if (processingModeEl) {
        const taskOptions = task.options && typeof task.options === 'object' ? task.options : {};
        const aiOptions = taskOptions.ai && typeof taskOptions.ai === 'object' ? taskOptions.ai : {};
        const provider = String(aiOptions.provider || 'unknown');
        const model = String(aiOptions.model || 'unknown');
        processingModeEl.title = `Provider: ${provider} | Model: ${model}`;
    }
    if (authDom.saveCleanBtn) authDom.saveCleanBtn.disabled = !processed;
    if (authDom.saveHighlightBtn) authDom.saveHighlightBtn.disabled = !processed;
    appAuth.actions.refreshProcessButtonState();
    if (appAuth.actions && typeof appAuth.actions.renderFallbackInsightsFromCurrentState === 'function') {
        appAuth.actions.renderFallbackInsightsFromCurrentState();
    }
    if (appAuth.actions && typeof appAuth.actions.restoreAssistantChatHistoryForCurrentTask === 'function') {
        appAuth.actions.restoreAssistantChatHistoryForCurrentTask();
    }
    if (appAuth.actions && typeof appAuth.actions.renderRunStagesFromState === 'function') {
        appAuth.actions.renderRunStagesFromState();
    }
    appAuth.actions.switch_tab(processed ? 'corrected' : 'original');
    renderTaskHistory();
    renderAdminDocxStructureSummary();
}

function loadTaskIntoEditor(taskId) {
    if (!taskId) {
        return;
    }
    appAuth.actions.setStatus('Loading task...', 'warning');
    const called = callApiOrEel(
        (api) => api.tasks && typeof api.tasks.get === 'function' ? api.tasks.get(taskId) : null,
        'get_task',
        [taskId],
        function (response) {
            if (!response || !response.success || !response.task) {
                appAuth.actions.setStatus('Could not load selected task', 'error');
                return;
            }
            applyTaskDetailsToState(response.task);
            appAuth.actions.setStatus('Task loaded', 'success');
        }
    );
    if (!called) {
        appAuth.actions.setStatus('Could not load selected task', 'error');
    }
}

function hydrateCurrentRouteTaskIfNeeded() {
    const routeTaskId = getCurrentTaskRouteId();
    if (!routeTaskId) {
        return;
    }
    loadTaskIntoEditor(routeTaskId);
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
    const called = callApiOrEel(
        (api) => api.auth && typeof api.auth.config === 'function' ? api.auth.config() : null,
        'auth_config',
        [],
        function (response) {
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
        }
    );
    if (!called) {
        setLoginStatus('Cannot read auth configuration from server.', 'error');
    }
}

function submitLocalLogin() {
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
    const called = callApiOrEel(
        (api) => api.auth && typeof api.auth.localLogin === 'function' ? api.auth.localLogin(username, password) : null,
        'auth_local_login',
        [username, password],
        function (authResponse) {
            if (authDom.localLoginBtn) {
                authDom.localLoginBtn.disabled = false;
            }
            if (!authResponse || !authResponse.success) {
                const message = authResponse && authResponse.error ? String(authResponse.error) : 'Local login failed';
                setLoginStatus(message, 'error');
                return;
            }
            handleAuthenticatedUser(authResponse.user || null);
        }
    );
    if (!called) {
        if (authDom.localLoginBtn) {
            authDom.localLoginBtn.disabled = false;
        }
        setLoginStatus('Local auth bridge unavailable.', 'error');
    }
}

function onGoogleCredentialResponse(response) {
    const credential = response && response.credential ? String(response.credential) : '';
    if (!credential) {
        setLoginStatus('Google sign-in failed: missing credential.', 'error');
        return;
    }
    setLoginStatus('Signing in...', 'warning');
    const called = callApiOrEel(
        (api) => api.auth && typeof api.auth.googleLogin === 'function' ? api.auth.googleLogin(credential) : null,
        'auth_google_login',
        [credential],
        function (authResponse) {
            if (!authResponse || !authResponse.success) {
                const message = authResponse && authResponse.error ? String(authResponse.error) : 'Login failed';
                setLoginStatus(message, 'error');
                return;
            }
            handleAuthenticatedUser(authResponse.user || null);
        }
    );
    if (!called) {
        setLoginStatus('Auth bridge unavailable.', 'error');
    }
}

function handleAuthenticatedUser(user) {
    applyCurrentUser(user || null);
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
    const taskDetailPage = appAuth.pages && appAuth.pages.taskDetail;
    if (taskDetailPage && typeof taskDetailPage.hydrateCurrentRouteTaskIfNeeded === 'function') {
        taskDetailPage.hydrateCurrentRouteTaskIfNeeded();
    }
    if (authHelpers.isAdminUser(authState.currentUser)) {
        if (isAdminDashboardRoute()) {
            openAdminPanel();
        } else {
            refreshAdminUsers();
            refreshAdminAudit();
        }
    }
}

function checkAuthenticatedUser() {
    const called = callApiOrEel(
        (api) => api.auth && typeof api.auth.me === 'function' ? api.auth.me() : null,
        'auth_me',
        [],
        function (response) {
            if (!response || !response.success || !response.user) {
                applyCurrentUser(null);
                showLoginView();
                loadAuthConfigThenRenderLogin();
                return;
            }
            handleAuthenticatedUser(response.user);
        }
    );
    if (!called) {
        showLoginView();
        setLoginStatus('Auth bridge unavailable.', 'error');
        return;
    }
}

function logoutCurrentUser() {
    const called = callApiOrEel(
        (api) => api.auth && typeof api.auth.logout === 'function' ? api.auth.logout() : null,
        'auth_logout',
        [],
        function () {
            applyCurrentUser(null);
            appAuth.actions.clear_all();
            showLoginView();
            loadAuthConfigThenRenderLogin();
        }
    );
    if (!called) {
        return;
    }
}

function renderAdminUsers() {
    const usersModule = appAuth.adminUsers || {};
    if (typeof usersModule.renderAdminUsers === 'function') {
        return usersModule.renderAdminUsers();
    }
    return undefined;
}

function renderAdminAudit() {
    const auditModule = appAuth.adminAudit || {};
    if (typeof auditModule.renderAdminAudit === 'function') {
        return auditModule.renderAdminAudit();
    }
    return undefined;
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
    if (selected === 'agent_router') return ['deepseek-v3.1', 'deepseek-r1-0528', 'claude-opus-4-6'];
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
    if (!authDom.adminSettingOllamaHost) {
        return;
    }
    const host = String(authDom.adminSettingOllamaHost.value || '').trim();
    if (!forceRefresh && host && host === authState.adminGlobalOllamaModelHostCache && authState.adminGlobalOllamaModelCache.length > 0) {
        return;
    }
    callApiOrEel(
        (api) => api.runtime && typeof api.runtime.ollamaModels === 'function' ? api.runtime.ollamaModels(host) : null,
        'get_ollama_models',
        [host],
        function (response) {
            if (!response || !response.success) {
                return;
            }
            authState.adminGlobalOllamaModelHostCache = host;
            authState.adminGlobalOllamaModelCache = authHelpers.uniqueNonEmpty(Array.isArray(response.models) ? response.models : []);
            updateAdminGlobalAiProviderUI(false);
            updateAdminAiValidationHint();
        }
    );
}

function updateAdminGlobalAiProviderUI(forceDefaultModel) {
    if (!authDom.adminSettingAiProvider || !authDom.adminSettingAiModel) {
        return;
    }
    const provider = String(authDom.adminSettingAiProvider.value || '').toLowerCase();
    const usesOpenrouterKey = provider === 'openrouter';
    const usesAgentRouterKey = provider === 'agent_router';
    const usesGeminiKey = provider === 'gemini';
    if (authDom.adminSettingGeminiKey) authDom.adminSettingGeminiKey.disabled = !usesGeminiKey;
    if (authDom.adminSettingOpenrouterKey) authDom.adminSettingOpenrouterKey.disabled = !usesOpenrouterKey;
    if (authDom.adminSettingAgentRouterKey) authDom.adminSettingAgentRouterKey.disabled = !usesAgentRouterKey;
    if (authDom.adminSettingOllamaHost) authDom.adminSettingOllamaHost.disabled = provider !== 'ollama';
    setElementVisible(authDom.adminSettingGeminiKey, usesGeminiKey);
    setElementVisible(authDom.adminSettingOpenrouterKey, usesOpenrouterKey);
    setElementVisible(authDom.adminSettingAgentRouterKey, usesAgentRouterKey);
    setElementVisible(authDom.adminSettingOllamaHost, provider === 'ollama');

    authDom.adminSettingAiModel.placeholder = provider === 'gemini'
        ? 'gemini-1.5-flash'
        : provider === 'ollama'
            ? 'llama3.1'
            : provider === 'agent_router'
                ? 'deepseek-v3.1'
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
    if (selected === 'agent_router') return 'https://agentrouter.org/v1/chat/completions';
    return 'https://openrouter.ai/api/v1/chat/completions';
}

function getSavedValidationModelForProvider(provider, aiSettings) {
    const selected = String(provider || '').trim().toLowerCase();
    const ai = aiSettings && typeof aiSettings === 'object' ? aiSettings : {};
    const savedProvider = String(ai.provider || '').trim().toLowerCase();
    const savedModel = String(ai.model || '').trim();
    if (savedProvider === selected && savedModel) {
        return savedModel;
    }
    return authConstants.DEFAULT_MODEL_BY_PROVIDER[selected] || authConstants.DEFAULT_MODEL_BY_PROVIDER.openrouter;
}

function getSavedValidationKeyForProvider(provider, aiSettings) {
    const selected = String(provider || '').trim().toLowerCase();
    const ai = aiSettings && typeof aiSettings === 'object' ? aiSettings : {};
    if (selected === 'gemini') return String(ai.gemini_api_key || '');
    if (selected === 'openrouter') return String(ai.openrouter_api_key || '');
    if (selected === 'agent_router') return String(ai.agent_router_api_key || '');
    return '';
}

function syncAdminValidationInputs(forceOverwrite) {
    const ai = authState.runtimeManagedSettings && authState.runtimeManagedSettings.ai && typeof authState.runtimeManagedSettings.ai === 'object'
        ? authState.runtimeManagedSettings.ai
        : {};
    const provider = authDom.adminAiProviderSelect ? String(authDom.adminAiProviderSelect.value || '').toLowerCase() : '';
    if (!provider) {
        return;
    }

    const nextModel = getSavedValidationModelForProvider(provider, ai);
    const nextKey = getSavedValidationKeyForProvider(provider, ai);
    const nextHost = provider === 'ollama'
        ? String(ai.ollama_host || authDom.adminAiOllamaHostInput?.value || 'http://localhost:11434')
        : getAdminProviderEndpoint(provider, authDom.adminAiOllamaHostInput ? authDom.adminAiOllamaHostInput.value : '');

    if (authDom.adminAiModelInput && (forceOverwrite || !String(authDom.adminAiModelInput.value || '').trim())) {
        authDom.adminAiModelInput.value = nextModel;
    }
    if (authDom.adminAiKeyInput && provider !== 'ollama' && (forceOverwrite || !String(authDom.adminAiKeyInput.value || '').trim())) {
        authDom.adminAiKeyInput.value = nextKey;
    }
    if (authDom.adminAiOllamaHostInput && (forceOverwrite || !String(authDom.adminAiOllamaHostInput.value || '').trim() || provider !== 'ollama')) {
        authDom.adminAiOllamaHostInput.value = nextHost;
    }
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
    if (authDom.adminSettingOnlineReferenceSerperFallback) authDom.adminSettingOnlineReferenceSerperFallback.checked = editing.online_reference_serper_fallback !== false;
    if (authDom.adminSettingDoiInsertionMode) authDom.adminSettingDoiInsertionMode.value = editing.doi_insertion_mode === 'strict' ? 'strict' : 'balanced';
    if (authDom.adminSettingOnlineReferenceValidationAdminCap) {
        authDom.adminSettingOnlineReferenceValidationAdminCap.value = authHelpers.clampInt(
            editing.online_reference_validation_admin_cap,
            1,
            500,
            150
        );
    }
    if (authDom.adminSettingAutoResolveUnresolvedReferences) {
        authDom.adminSettingAutoResolveUnresolvedReferences.checked = editing.auto_resolve_unresolved_references !== false;
    }
    if (authDom.adminSettingDomainProfile) authDom.adminSettingDomainProfile.value = String(editing.domain_profile || 'auto');
    if (authDom.adminSettingCmosProfile) {
        const profile = String(editing.cmos_profile || 'core');
        authDom.adminSettingCmosProfile.value = ['core', 'strict', 'journal_custom'].includes(profile) ? profile : 'core';
    }
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
    if (authDom.adminSettingAgentRouterKey) authDom.adminSettingAgentRouterKey.value = String(ai.agent_router_api_key || '');
    if (authDom.adminSettingSectionWise) authDom.adminSettingSectionWise.checked = ai.section_wise !== false;
    if (authDom.adminSettingSectionThresholdChars) authDom.adminSettingSectionThresholdChars.value = Number(ai.section_threshold_chars || 12000);
    if (authDom.adminSettingSectionThresholdParagraphs) authDom.adminSettingSectionThresholdParagraphs.value = Number(ai.section_threshold_paragraphs || 90);
    if (authDom.adminSettingSectionChunkChars) authDom.adminSettingSectionChunkChars.value = Number(ai.section_chunk_chars || 5500);
    if (authDom.adminSettingSectionChunkLines) authDom.adminSettingSectionChunkLines.value = Number(ai.section_chunk_lines || 28);
    if (authDom.adminSettingGlobalConsistencyMaxChars) authDom.adminSettingGlobalConsistencyMaxChars.value = Number(ai.global_consistency_max_chars || 18000);
    if (authDom.adminSettingOllamaGenerateTimeoutSeconds) authDom.adminSettingOllamaGenerateTimeoutSeconds.value = authHelpers.clampNumber(ai.ollama_generate_timeout_seconds, 1, 600, 60);
    if (authDom.adminSettingOllamaHealthTimeoutSeconds) authDom.adminSettingOllamaHealthTimeoutSeconds.value = authHelpers.clampNumber(ai.ollama_health_timeout_seconds, 1, 60, 5);
    if (authDom.adminSettingOllamaRetryCount) authDom.adminSettingOllamaRetryCount.value = authHelpers.clampInt(ai.ollama_retry_count, 0, 3, 0);
    if (authDom.adminSettingOllamaRetryBackoffSeconds) authDom.adminSettingOllamaRetryBackoffSeconds.value = authHelpers.clampNumber(ai.ollama_retry_backoff_seconds, 0, 30, 0);
    if (authDom.adminSettingOllamaFallbackModelRetry) authDom.adminSettingOllamaFallbackModelRetry.checked = ai.ollama_fallback_model_retry !== false;
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
            online_reference_serper_fallback: authDom.adminSettingOnlineReferenceSerperFallback ? authDom.adminSettingOnlineReferenceSerperFallback.checked : true,
            doi_insertion_mode: authDom.adminSettingDoiInsertionMode ? String(authDom.adminSettingDoiInsertionMode.value || 'balanced') : 'balanced',
            online_reference_validation_admin_cap: authHelpers.clampInt(
                authDom.adminSettingOnlineReferenceValidationAdminCap ? authDom.adminSettingOnlineReferenceValidationAdminCap.value : 150,
                1,
                500,
                150
            ),
            auto_resolve_unresolved_references: authDom.adminSettingAutoResolveUnresolvedReferences
                ? authDom.adminSettingAutoResolveUnresolvedReferences.checked
                : true,
            domain_profile: authDom.adminSettingDomainProfile ? String(authDom.adminSettingDomainProfile.value || 'auto') : 'auto',
            cmos_profile: authDom.adminSettingCmosProfile ? String(authDom.adminSettingCmosProfile.value || 'core') : 'core',
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
            agent_router_api_key: authDom.adminSettingAgentRouterKey ? String(authDom.adminSettingAgentRouterKey.value || '').trim() : '',
            section_wise: authDom.adminSettingSectionWise ? authDom.adminSettingSectionWise.checked : true,
            section_threshold_chars: authHelpers.clampInt(authDom.adminSettingSectionThresholdChars ? authDom.adminSettingSectionThresholdChars.value : 12000, 4000, 120000, 12000),
            section_threshold_paragraphs: authHelpers.clampInt(authDom.adminSettingSectionThresholdParagraphs ? authDom.adminSettingSectionThresholdParagraphs.value : 90, 20, 1000, 90),
            section_chunk_chars: authHelpers.clampInt(authDom.adminSettingSectionChunkChars ? authDom.adminSettingSectionChunkChars.value : 5500, 1800, 30000, 5500),
            section_chunk_lines: authHelpers.clampInt(authDom.adminSettingSectionChunkLines ? authDom.adminSettingSectionChunkLines.value : 28, 8, 200, 28),
            global_consistency_max_chars: authHelpers.clampInt(authDom.adminSettingGlobalConsistencyMaxChars ? authDom.adminSettingGlobalConsistencyMaxChars.value : 18000, 6000, 120000, 18000),
            ollama_generate_timeout_seconds: authHelpers.clampNumber(authDom.adminSettingOllamaGenerateTimeoutSeconds ? authDom.adminSettingOllamaGenerateTimeoutSeconds.value : 60, 1, 600, 60),
            ollama_health_timeout_seconds: authHelpers.clampNumber(authDom.adminSettingOllamaHealthTimeoutSeconds ? authDom.adminSettingOllamaHealthTimeoutSeconds.value : 5, 1, 60, 5),
            ollama_retry_count: authHelpers.clampInt(authDom.adminSettingOllamaRetryCount ? authDom.adminSettingOllamaRetryCount.value : 0, 0, 3, 0),
            ollama_retry_backoff_seconds: authHelpers.clampNumber(authDom.adminSettingOllamaRetryBackoffSeconds ? authDom.adminSettingOllamaRetryBackoffSeconds.value : 0, 0, 30, 0),
            ollama_fallback_model_retry: authDom.adminSettingOllamaFallbackModelRetry ? authDom.adminSettingOllamaFallbackModelRetry.checked : true
        }
    };
}

function loadAdminGlobalSettings() {
    if (authDom.adminGlobalSettingsStatus) {
        authDom.adminGlobalSettingsStatus.textContent = 'Loading global settings...';
        authDom.adminGlobalSettingsStatus.style.color = '#ffd58d';
    }
    callApiOrEel(
        (api) => api.admin && typeof api.admin.globalSettings === 'function' ? api.admin.globalSettings() : null,
        'admin_get_global_settings',
        [],
        function (response) {
            if (!response || !response.success) {
                const message = response && response.error ? String(response.error) : 'Could not load global settings';
                if (authDom.adminGlobalSettingsStatus) {
                    authDom.adminGlobalSettingsStatus.textContent = message;
                    authDom.adminGlobalSettingsStatus.style.color = '#ffb8c2';
                }
                return;
            }
            applyAdminGlobalSettingsForm(response.settings || {});
            authState.runtimeManagedSettings = response.settings || authState.runtimeManagedSettings;
            syncAdminValidationInputs(true);
            updateAdminAiValidationHint();
            if (authDom.adminGlobalSettingsStatus) {
                authDom.adminGlobalSettingsStatus.textContent = 'Global settings loaded.';
                authDom.adminGlobalSettingsStatus.style.color = '#a9f2d3';
            }
        }
    );
}

function saveAdminGlobalSettings() {
    const settings = collectAdminGlobalSettingsForm();
    if (authDom.adminGlobalSettingsStatus) {
        authDom.adminGlobalSettingsStatus.textContent = 'Saving global settings...';
        authDom.adminGlobalSettingsStatus.style.color = '#ffd58d';
    }
    if (authDom.adminSaveGlobalSettingsBtn) {
        authDom.adminSaveGlobalSettingsBtn.disabled = true;
    }
    callApiOrEel(
        (api) => api.admin && typeof api.admin.updateGlobalSettings === 'function' ? api.admin.updateGlobalSettings(settings) : null,
        'admin_update_global_settings',
        [settings],
        function (response) {
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
            syncAdminValidationInputs(true);
            updateAdminAiValidationHint();
            if (authDom.adminGlobalSettingsStatus) {
                authDom.adminGlobalSettingsStatus.textContent = 'Global settings saved. New processing jobs now use this config.';
                authDom.adminGlobalSettingsStatus.style.color = '#a9f2d3';
            }
        }
    );
}

function refreshAdminUsers() {
    const usersModule = appAuth.adminUsers || {};
    if (typeof usersModule.refreshAdminUsers === 'function') {
        return usersModule.refreshAdminUsers();
    }
    return undefined;
}

function refreshAdminAudit() {
    const auditModule = appAuth.adminAudit || {};
    if (typeof auditModule.refreshAdminAudit === 'function') {
        return auditModule.refreshAdminAudit();
    }
    return undefined;
}

function renderAdminReferenceValidationDiagnostics(payload) {
    if (!authDom.adminReferenceDiagnosticsOutput) {
        return;
    }
    const safe = payload && typeof payload === 'object' ? payload : {};
    try {
        authDom.adminReferenceDiagnosticsOutput.textContent = JSON.stringify(safe, null, 2);
    } catch (_err) {
        authDom.adminReferenceDiagnosticsOutput.textContent = String(safe);
    }
    const trends = safe.unresolved_trends && typeof safe.unresolved_trends === 'object'
        ? safe.unresolved_trends
        : {};
    if (authDom.adminReferenceUnresolvedTrendSummary) {
        const runs = Number(trends.window_runs || 0);
        const bySource = trends.totals_by_source && typeof trends.totals_by_source === 'object' ? trends.totals_by_source : {};
        const topSource = Object.entries(bySource).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
        authDom.adminReferenceUnresolvedTrendSummary.textContent = runs > 0
            ? `Unresolved trends: last ${runs} runs. Top source: ${topSource ? `${topSource[0]} (${topSource[1]})` : 'n/a'}.`
            : 'Unresolved trends: no runs yet.';
    }
    if (authDom.adminReferenceDiagnosticsTrendsOutput) {
        const compact = {
            window_runs: Number(trends.window_runs || 0),
            totals_by_source: trends.totals_by_source || {},
            totals_by_reason: trends.totals_by_reason || {},
            runs: Array.isArray(trends.runs) ? trends.runs : []
        };
        try {
            authDom.adminReferenceDiagnosticsTrendsOutput.textContent = JSON.stringify(compact, null, 2);
        } catch (_err) {
            authDom.adminReferenceDiagnosticsTrendsOutput.textContent = String(compact);
        }
    }
}

function refreshAdminReferenceValidationDiagnostics() {
    if (!authState.currentUser || String(authState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (authDom.adminReferenceDiagnosticsStatus) {
        authDom.adminReferenceDiagnosticsStatus.textContent = 'Loading reference diagnostics...';
        authDom.adminReferenceDiagnosticsStatus.style.color = '#ffd58d';
    }
    if (authDom.adminRefreshReferenceDiagnosticsBtn) {
        authDom.adminRefreshReferenceDiagnosticsBtn.disabled = true;
    }
    callApiOrEel(
        (api) => api.admin && typeof api.admin.referenceValidationDiagnostics === 'function' ? api.admin.referenceValidationDiagnostics() : null,
        'admin_get_reference_validation_diagnostics',
        [],
        function (response) {
            if (authDom.adminRefreshReferenceDiagnosticsBtn) {
                authDom.adminRefreshReferenceDiagnosticsBtn.disabled = false;
            }
            if (!response || !response.success) {
                const message = response && response.error ? String(response.error) : 'Could not load reference diagnostics';
                if (authDom.adminReferenceDiagnosticsStatus) {
                    authDom.adminReferenceDiagnosticsStatus.textContent = message;
                    authDom.adminReferenceDiagnosticsStatus.style.color = '#ffb8c2';
                }
                return;
            }
            const diagnostics = response.diagnostics && typeof response.diagnostics === 'object'
                ? response.diagnostics
                : {};
            renderAdminReferenceValidationDiagnostics(diagnostics);
            const serper = diagnostics.serper && typeof diagnostics.serper === 'object'
                ? diagnostics.serper
                : {};
            const effective = serper.effective_enabled === true;
            const configured = serper.configured === true;
            if (authDom.adminReferenceDiagnosticsStatus) {
                authDom.adminReferenceDiagnosticsStatus.textContent = configured
                    ? (effective ? 'Serper fallback is effectively enabled by current settings.' : 'Serper key is configured, but runtime settings currently disable fallback.')
                    : 'SERPER_API_KEY is not configured in server runtime.';
                authDom.adminReferenceDiagnosticsStatus.style.color = configured
                    ? (effective ? '#a9f2d3' : '#ffd58d')
                    : '#ffb8c2';
            }
        }
    );
}

function resetAdminReferenceValidationDiagnostics() {
    if (!authState.currentUser || String(authState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (authDom.adminReferenceDiagnosticsStatus) {
        authDom.adminReferenceDiagnosticsStatus.textContent = 'Resetting reference diagnostics cache...';
        authDom.adminReferenceDiagnosticsStatus.style.color = '#ffd58d';
    }
    if (authDom.adminResetReferenceDiagnosticsBtn) {
        authDom.adminResetReferenceDiagnosticsBtn.disabled = true;
    }
    if (authDom.adminRefreshReferenceDiagnosticsBtn) {
        authDom.adminRefreshReferenceDiagnosticsBtn.disabled = true;
    }
    callApiOrEel(
        (api) => api.admin && typeof api.admin.resetReferenceValidationDiagnostics === 'function' ? api.admin.resetReferenceValidationDiagnostics() : null,
        'admin_reset_reference_validation_diagnostics',
        [],
        function (response) {
            if (authDom.adminResetReferenceDiagnosticsBtn) {
                authDom.adminResetReferenceDiagnosticsBtn.disabled = false;
            }
            if (authDom.adminRefreshReferenceDiagnosticsBtn) {
                authDom.adminRefreshReferenceDiagnosticsBtn.disabled = false;
            }
            if (!response || !response.success) {
                const message = response && response.error ? String(response.error) : 'Could not reset reference diagnostics cache';
                if (authDom.adminReferenceDiagnosticsStatus) {
                    authDom.adminReferenceDiagnosticsStatus.textContent = message;
                    authDom.adminReferenceDiagnosticsStatus.style.color = '#ffb8c2';
                }
                return;
            }
            const diagnostics = response.diagnostics && typeof response.diagnostics === 'object'
                ? response.diagnostics
                : {};
            renderAdminReferenceValidationDiagnostics(diagnostics);
            const removed = Number(response.removed_cache_entries || 0);
            if (authDom.adminReferenceDiagnosticsStatus) {
                authDom.adminReferenceDiagnosticsStatus.textContent = `Diagnostics cache reset completed. Removed ${removed} entr${removed === 1 ? 'y' : 'ies'}.`;
                authDom.adminReferenceDiagnosticsStatus.style.color = '#a9f2d3';
            }
        }
    );
}

function updateAdminUserStatus(userId, nextStatus) {
    const usersModule = appAuth.adminUsers || {};
    if (typeof usersModule.updateAdminUserStatus === 'function') {
        return usersModule.updateAdminUserStatus(userId, nextStatus);
    }
    return undefined;
}

function updateAdminAiValidationHint() {
    if (!authDom.adminAiProviderSelect || !authDom.adminAiModelInput || !authDom.adminAiKeyInput || !authDom.adminAiOllamaHostInput) {
        return;
    }
    const provider = String(authDom.adminAiProviderSelect.value || '').toLowerCase();
    const usesRemoteKey = provider === 'openrouter' || provider === 'agent_router' || provider === 'gemini';
    if (authDom.adminAiKeyField) {
        setElementVisible(authDom.adminAiKeyField, usesRemoteKey);
    }
    authDom.adminAiKeyInput.disabled = !usesRemoteKey;
    authDom.adminAiOllamaHostInput.readOnly = provider !== 'ollama';
    if (provider !== 'ollama') {
        authDom.adminAiOllamaHostInput.value = getAdminProviderEndpoint(provider, authDom.adminAiOllamaHostInput.value);
    }
    authDom.adminAiOllamaHostInput.placeholder = provider === 'ollama' ? 'Ollama host' : 'Provider endpoint';
    authDom.adminAiKeyInput.placeholder = provider === 'gemini'
        ? 'Gemini API key (blank uses saved/server key)'
        : provider === 'agent_router'
            ? 'AgentRouter token (blank uses saved/server token)'
            : 'OpenRouter API key (blank uses saved/server key)';
    authDom.adminAiModelInput.placeholder = provider === 'gemini'
        ? 'gemini-1.5-flash'
        : provider === 'ollama'
            ? 'llama3.1'
            : provider === 'agent_router'
                ? 'deepseek-v3.1'
                : 'openrouter/auto';
    if (authDom.adminAiValidationHelp) {
        authDom.adminAiValidationHelp.textContent = provider === 'ollama'
            ? 'Leave host blank to validate the saved Ollama host. A model check now verifies that the selected model exists.'
            : provider === 'agent_router'
                ? 'Use the exact AgentRouter model ID from your dashboard, such as deepseek-v3.1 or claude-opus-4-6. Leave token blank to use the saved token or AGENT_ROUTER_TOKEN.'
                : provider === 'gemini'
                    ? 'Leave key blank to validate with the saved Gemini key or GEMINI_API_KEY from server env.'
                    : 'Leave key blank to validate with the saved OpenRouter key or OPENROUTER_API_KEY from server env.';
    }
    applyDatalistOptions(
        authDom.adminAiModelList,
        getModelSuggestionsForProvider(provider, provider === 'ollama' ? authState.adminGlobalOllamaModelCache : [])
    );
    if (!String(authDom.adminAiModelInput.value || '').trim()) {
        authDom.adminAiModelInput.value = authConstants.DEFAULT_MODEL_BY_PROVIDER[provider] || authConstants.DEFAULT_MODEL_BY_PROVIDER.openrouter;
    }
    syncAdminValidationInputs(false);
}

function validateAdminAiProvider() {
    if (!authDom.adminAiProviderSelect || !authDom.adminAiModelInput || !authDom.adminAiKeyInput || !authDom.adminAiOllamaHostInput) {
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
    callApiOrEel(
        (api) => api.admin && typeof api.admin.validateAiProvider === 'function' ? api.admin.validateAiProvider(payload) : null,
        'admin_validate_ai_provider',
        [payload],
        function (response) {
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
        }
    );
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
    syncAdminValidationInputs(true);
    updateAdminAiValidationHint();
    if (authDom.adminAiValidationResult) {
        authDom.adminAiValidationResult.textContent = 'Run a provider check from server runtime.';
        authDom.adminAiValidationResult.style.color = '#a8bddf';
    }
    loadAdminGlobalSettings();
    refreshAdminUsers();
    refreshAdminAudit();
    refreshAdminReferenceValidationDiagnostics();
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
    callApiOrEel,
    setLoginStatus,
    showLoginView,
    showAppView,
    isAdminDashboardRoute,
    navigateToAdminDashboard,
    isTasksDashboardRoute,
    getCurrentTaskRouteId,
    isTaskDetailRoute,
    navigateToTasksDashboard,
    navigateToTask,
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
    hydrateCurrentRouteTaskIfNeeded,
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
    renderAdminReferenceValidationDiagnostics,
    refreshAdminReferenceValidationDiagnostics,
    resetAdminReferenceValidationDiagnostics,
    updateAdminUserStatus,
    updateAdminAiValidationHint,
    validateAdminAiProvider,
    openAdminPanel,
    closeAdminPanel,
    submitLocalLogin
};

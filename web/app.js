let currentTab = 'original';
let currentViewMode = 'rich';
let fileContent = {
    taskId: '',
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
let currentUser = null;
let taskHistory = [];
let adminUsers = [];
let adminEvents = [];
let runtimeManagedSettings = null;
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
const FIXED_JOURNAL_PROFILE = 'vancouver_periods';
const ADMIN_DASHBOARD_PATH = '/admin-dashboard';
let adminGlobalOllamaModelCache = [];
let adminGlobalOllamaModelHostCache = '';

const loginView = document.getElementById('login-view');
const appShell = document.getElementById('app-shell');
const loginStatus = document.getElementById('login-status');
const loginDomainsEl = document.getElementById('login-domains');
const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const logoutBtn = document.getElementById('logout-btn');
const refreshHistoryBtn = document.getElementById('refresh-history-btn');
const taskHistoryEl = document.getElementById('task-history');
const openAdminPanelBtn = document.getElementById('open-admin-panel-btn');
const adminPanelBackdrop = document.getElementById('admin-panel-backdrop');
const adminClosePanelBtn = document.getElementById('admin-close-panel-btn');
const adminRefreshUsersBtn = document.getElementById('admin-refresh-users-btn');
const adminRefreshAuditBtn = document.getElementById('admin-refresh-audit-btn');
const adminUsersBody = document.getElementById('admin-users-body');
const adminAuditBody = document.getElementById('admin-audit-body');
const adminAiProviderSelect = document.getElementById('admin-ai-provider');
const adminAiModelInput = document.getElementById('admin-ai-model');
const adminAiModelList = document.getElementById('admin-ai-model-list');
const adminAiKeyInput = document.getElementById('admin-ai-key');
const adminAiOllamaHostInput = document.getElementById('admin-ai-ollama-host');
const adminValidateAiBtn = document.getElementById('admin-validate-ai-btn');
const adminAiValidationResult = document.getElementById('admin-ai-validation-result');
const editingOptionsSection = document.getElementById('editing-options-section');
const aiSettingsSection = document.getElementById('ai-settings-section');
const managedSettingsNote = document.getElementById('managed-settings-note');
const adminLoadGlobalSettingsBtn = document.getElementById('admin-load-global-settings-btn');
const adminSaveGlobalSettingsBtn = document.getElementById('admin-save-global-settings-btn');
const adminGlobalSettingsStatus = document.getElementById('admin-global-settings-status');
const adminSettingSpelling = document.getElementById('admin-setting-spelling');
const adminSettingSentenceCase = document.getElementById('admin-setting-sentence-case');
const adminSettingPunctuation = document.getElementById('admin-setting-punctuation');
const adminSettingChicagoStyle = document.getElementById('admin-setting-chicago-style');
const adminSettingCmosStrict = document.getElementById('admin-setting-cmos-strict');
const adminSettingDomainProfile = document.getElementById('admin-setting-domain-profile');
const adminSettingCustomTerms = document.getElementById('admin-setting-custom-terms');
const adminSettingAiEnabled = document.getElementById('admin-setting-ai-enabled');
const adminSettingAiProvider = document.getElementById('admin-setting-ai-provider');
const adminSettingAiModel = document.getElementById('admin-setting-ai-model');
const adminSettingAiModelList = document.getElementById('admin-setting-ai-model-list');
const adminSettingOllamaHost = document.getElementById('admin-setting-ollama-host');
const adminSettingGeminiKey = document.getElementById('admin-setting-gemini-key');
const adminSettingOpenrouterKey = document.getElementById('admin-setting-openrouter-key');
const adminSettingSectionWise = document.getElementById('admin-setting-section-wise');
const adminSettingSectionThresholdChars = document.getElementById('admin-setting-section-threshold-chars');
const adminSettingSectionThresholdParagraphs = document.getElementById('admin-setting-section-threshold-paragraphs');
const adminSettingSectionChunkChars = document.getElementById('admin-setting-section-chunk-chars');
const adminSettingSectionChunkLines = document.getElementById('admin-setting-section-chunk-lines');
const adminSettingGlobalConsistencyMaxChars = document.getElementById('admin-setting-global-consistency-max-chars');

// File handling
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseFileBtn = document.getElementById('browse-file-btn');
const processBtn = document.getElementById('process-btn');
const saveCleanBtn = document.getElementById('save-clean-btn');
const saveHighlightBtn = document.getElementById('save-highlight-btn');
const clearBtn = document.getElementById('clear-btn');
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
const cmosStrictInput = document.getElementById('opt-cmos-strict');
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

function formatUnixTimestamp(ts) {
    const value = Number(ts || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return '-';
    }
    try {
        return new Date(value * 1000).toLocaleString();
    } catch (err) {
        return '-';
    }
}

function setLoginStatus(message, type = 'info') {
    if (!loginStatus) {
        return;
    }
    loginStatus.textContent = message || '';
    const colors = {
        info: '#a8bddf',
        success: '#a9f2d3',
        warning: '#ffd58d',
        error: '#ffb8c2'
    };
    loginStatus.style.color = colors[type] || colors.info;
}

function showLoginView() {
    if (loginView) {
        loginView.classList.remove('hidden');
    }
    if (appShell) {
        appShell.classList.add('hidden');
    }
}

function showAppView() {
    if (loginView) {
        loginView.classList.add('hidden');
    }
    if (appShell) {
        appShell.classList.remove('hidden');
    }
}

function normalizePathname(pathname) {
    const raw = String(pathname || '/').trim();
    if (!raw || raw === '/') {
        return '/';
    }
    const withoutTrailing = raw.replace(/\/+$/g, '');
    return withoutTrailing || '/';
}

function isAdminDashboardRoute() {
    return normalizePathname(window.location.pathname) === ADMIN_DASHBOARD_PATH;
}

function navigateToAdminDashboard() {
    if (isAdminDashboardRoute()) {
        return;
    }
    window.location.assign(ADMIN_DASHBOARD_PATH);
}

function navigateToEditor() {
    if (normalizePathname(window.location.pathname) === '/') {
        return;
    }
    window.location.assign('/');
}

function setAdminDashboardVisible(visible) {
    const showAdmin = visible === true;
    document.body.classList.toggle('admin-dashboard-active', showAdmin);
    if (!adminPanelBackdrop) {
        return;
    }
    adminPanelBackdrop.classList.toggle('hidden', !showAdmin);
}

function resetAdminDashboardScroll() {
    if (!isAdminDashboardRoute()) {
        return;
    }
    window.scrollTo(0, 0);
    if (adminPanelBackdrop) {
        adminPanelBackdrop.scrollTop = 0;
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
    if (!currentUser || typeof currentUser !== 'object') {
        return;
    }
    setAdminDashboardVisible(isAdminUser(currentUser));
}

function normalizeUserRole(roleValue) {
    return String(roleValue || 'USER').trim().toUpperCase();
}

function isAdminUser(user) {
    return normalizeUserRole(user && user.role) === 'ADMIN';
}

function applyCurrentUser(user) {
    if (!user || typeof user !== 'object') {
        currentUser = null;
        if (userNameEl) {
            userNameEl.textContent = 'User';
        }
        if (userRoleEl) {
            userRoleEl.textContent = 'USER';
        }
        if (openAdminPanelBtn) {
            openAdminPanelBtn.classList.add('hidden');
        }
        if (editingOptionsSection) {
            editingOptionsSection.classList.add('hidden');
        }
        if (aiSettingsSection) {
            aiSettingsSection.classList.add('hidden');
        }
        if (managedSettingsNote) {
            managedSettingsNote.classList.remove('hidden');
        }
        if (isAdminDashboardRoute()) {
            setAdminDashboardVisible(false);
        }
        return;
    }
    currentUser = user;
    if (userNameEl) {
        userNameEl.textContent = String(user.display_name || user.email || 'User');
    }
    const role = normalizeUserRole(user.role);
    if (userRoleEl) {
        userRoleEl.textContent = role;
    }
    if (openAdminPanelBtn) {
        openAdminPanelBtn.classList.toggle('hidden', role !== 'ADMIN' || isAdminDashboardRoute());
    }
    if (editingOptionsSection) {
        editingOptionsSection.classList.add('hidden');
    }
    if (aiSettingsSection) {
        aiSettingsSection.classList.add('hidden');
    }
    if (managedSettingsNote) {
        managedSettingsNote.classList.remove('hidden');
    }
    if (isAdminDashboardRoute()) {
        setAdminDashboardVisible(role === 'ADMIN');
    }
}

function renderTaskHistory() {
    if (!taskHistoryEl) {
        return;
    }

    if (!Array.isArray(taskHistory) || taskHistory.length === 0) {
        taskHistoryEl.innerHTML = '<p class=\"task-empty\">No tasks yet. Upload a manuscript to start.</p>';
        return;
    }

    let html = '';
    taskHistory.forEach((task) => {
        const taskId = String(task.id || '');
        const activeClass = taskId && taskId === fileContent.taskId ? ' active' : '';
        const status = escapeHtml(String(task.status || 'UPLOADED'));
        const words = Number(task.word_count || 0);
        html += `<div class=\"task-history-item${activeClass}\" data-task-id=\"${escapeHtml(taskId)}\">`;
        html += `<div class=\"task-history-title\">${escapeHtml(String(task.file_name || 'Untitled manuscript'))}</div>`;
        html += `<div class=\"task-history-meta\">${status} • ${words} words • ${escapeHtml(formatUnixTimestamp(task.updated_at))}</div>`;
        html += '</div>';
    });
    taskHistoryEl.innerHTML = html;

    taskHistoryEl.querySelectorAll('.task-history-item[data-task-id]').forEach((node) => {
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
        taskHistory = Array.isArray(response.tasks) ? response.tasks : [];
        renderTaskHistory();
    });
}

function refreshRuntimeSettings(callback) {
    if (typeof eel === 'undefined' || typeof eel.get_runtime_settings !== 'function') {
        runtimeManagedSettings = null;
        if (typeof callback === 'function') {
            callback(null);
        }
        return;
    }
    eel.get_runtime_settings()(function (response) {
        if (response && response.success && response.settings && typeof response.settings === 'object') {
            runtimeManagedSettings = response.settings;
            if (typeof callback === 'function') {
                callback(runtimeManagedSettings);
            }
            return;
        }
        runtimeManagedSettings = null;
        if (typeof callback === 'function') {
            callback(null);
        }
    });
}

function buildProcessingOptionsFromRuntimeSettings() {
    const defaults = {
        spelling: true,
        sentence_case: true,
        punctuation: true,
        chicago_style: true,
        cmos_strict_mode: true,
        domain_profile: 'auto',
        custom_terms: [],
        journal_profile: FIXED_JOURNAL_PROFILE,
        reference_profile: FIXED_JOURNAL_PROFILE,
        ai: {
            enabled: true,
            provider: 'ollama',
            model: DEFAULT_MODEL_BY_PROVIDER.ollama,
            ollama_host: 'http://localhost:11434',
            api_key: '',
            gemini_api_key: '',
            openrouter_api_key: '',
            section_wise: true,
            section_threshold_chars: 12000,
            section_threshold_paragraphs: 90,
            section_chunk_chars: 5500,
            section_chunk_lines: 28,
            global_consistency_max_chars: 18000
        }
    };
    const settings = runtimeManagedSettings && typeof runtimeManagedSettings === 'object' ? runtimeManagedSettings : null;
    if (!settings) {
        return defaults;
    }
    const editing = settings.editing && typeof settings.editing === 'object' ? settings.editing : {};
    const ai = settings.ai && typeof settings.ai === 'object' ? settings.ai : {};
    return {
        spelling: editing.spelling !== false,
        sentence_case: editing.sentence_case !== false,
        punctuation: editing.punctuation !== false,
        chicago_style: editing.chicago_style !== false,
        cmos_strict_mode: editing.cmos_strict_mode !== false,
        domain_profile: String(editing.domain_profile || 'auto'),
        custom_terms: Array.isArray(editing.custom_terms) ? editing.custom_terms : [],
        journal_profile: FIXED_JOURNAL_PROFILE,
        reference_profile: FIXED_JOURNAL_PROFILE,
        ai: {
            enabled: ai.enabled !== false,
            provider: String(ai.provider || 'ollama'),
            model: String(ai.model || ''),
            ollama_host: String(ai.ollama_host || ''),
            api_key: String(ai.gemini_api_key || ''),
            gemini_api_key: String(ai.gemini_api_key || ''),
            openrouter_api_key: String(ai.openrouter_api_key || ''),
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
    fileContent.taskId = String(task.id || '');
    fileContent.fileName = String(task.file_name || '');
    fileContent.original = String(task.original_text || '');
    fileContent.corrected = String(task.corrected_text || '');
    fileContent.fullCorrectedText = String(task.full_corrected_text || '');

    const reports = task.reports && typeof task.reports === 'object' ? task.reports : {};
    fileContent.correctedAnnotatedHtml = String(reports.corrected_annotated_html || '');
    fileContent.redline = String(reports.redline_html || '');
    fileContent.corrections = reports.corrections_report || null;
    fileContent.nounReport = reports.noun_report || null;
    fileContent.domainReport = reports.domain_report || null;
    fileContent.journalProfileReport = reports.journal_profile_report || null;
    fileContent.citationReferenceReport = reports.citation_reference_report || null;
    fileContent.processingAudit = reports.processing_audit || null;
    fileContent.groupDecisions = buildDefaultGroupDecisions();

    const fileNameEl = document.getElementById('file-name');
    if (fileNameEl) {
        fileNameEl.textContent = fileContent.fileName || 'No file selected';
    }
    const wordCountEl = document.getElementById('word-count');
    if (wordCountEl) {
        wordCountEl.textContent = 'Words: ' + Number(task.word_count || 0);
    }

    const processed = String(task.status || '').toUpperCase() === 'PROCESSED';
    if (saveCleanBtn) {
        saveCleanBtn.disabled = !processed;
    }
    if (saveHighlightBtn) {
        saveHighlightBtn.disabled = !processed;
    }

    switch_tab(processed ? 'corrected' : 'original');
    renderTaskHistory();
}

function loadTaskIntoEditor(taskId) {
    if (!taskId || typeof eel === 'undefined' || typeof eel.get_task !== 'function') {
        return;
    }
    setStatus('Loading task...', 'warning');
    eel.get_task(taskId)(function (response) {
        if (!response || !response.success || !response.task) {
            setStatus('Could not load selected task', 'error');
            return;
        }
        applyTaskDetailsToState(response.task);
        setStatus('Task loaded', 'success');
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
        if (loginDomainsEl && domains.length > 0) {
            loginDomainsEl.innerHTML = 'Allowed domains: ' + domains.map((domain) => `<code>${escapeHtml(String(domain))}</code>`).join(', ');
        }
        ensureGoogleSigninButton();
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
        const user = authResponse.user || null;
        applyCurrentUser(user);
        showAppView();
        setStatus('Authenticated', 'success');
        if (isAdminDashboardRoute() && !isAdminUser(currentUser)) {
            navigateToEditor();
            return;
        }
        applyRouteViewMode();
        refreshRuntimeSettings();
        maybeShowSetupWizardOnFirstRun();
        refreshTaskHistory();
        if (isAdminUser(currentUser)) {
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
        if (isAdminDashboardRoute() && !isAdminUser(currentUser)) {
            navigateToEditor();
            return;
        }
        applyRouteViewMode();
        refreshRuntimeSettings();
        maybeShowSetupWizardOnFirstRun();
        refreshTaskHistory();
        if (isAdminUser(currentUser)) {
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
        clear_all();
        showLoginView();
        loadAuthConfigThenRenderLogin();
    });
}

function renderAdminUsers() {
    if (!adminUsersBody) {
        return;
    }
    if (!Array.isArray(adminUsers) || adminUsers.length === 0) {
        adminUsersBody.innerHTML = '<tr><td colspan=\"4\">No users found.</td></tr>';
        return;
    }
    let html = '';
    adminUsers.forEach((user) => {
        const userId = escapeHtml(String(user.id || ''));
        const status = String(user.status || 'ACTIVE').toUpperCase();
        const isActive = status === 'ACTIVE';
        const role = escapeHtml(String(user.role || 'USER'));
        const email = escapeHtml(String(user.email || ''));
        const statusClass = isActive ? 'active' : 'inactive';
        const actionLabel = isActive ? 'Deactivate' : 'Activate';
        const nextStatus = isActive ? 'INACTIVE' : 'ACTIVE';
        html += '<tr>';
        html += `<td>${email}<br><small>${escapeHtml(String(user.display_name || ''))}</small></td>`;
        html += `<td>${role}</td>`;
        html += `<td><span class=\"status-pill ${statusClass}\">${escapeHtml(status)}</span></td>`;
        html += `<td><button class=\"btn-secondary btn-small\" data-user-id=\"${userId}\" data-next-status=\"${nextStatus}\">${actionLabel}</button></td>`;
        html += '</tr>';
    });
    adminUsersBody.innerHTML = html;
    adminUsersBody.querySelectorAll('button[data-user-id][data-next-status]').forEach((button) => {
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
    if (!adminAuditBody) {
        return;
    }
    if (!Array.isArray(adminEvents) || adminEvents.length === 0) {
        adminAuditBody.innerHTML = '<tr><td colspan=\"4\">No events found.</td></tr>';
        return;
    }
    let html = '';
    adminEvents.forEach((event) => {
        const ts = formatUnixTimestamp(event.created_at);
        const actor = escapeHtml(String(event.actor_email || '-'));
        const target = escapeHtml(String(event.target_email || '-'));
        const eventType = escapeHtml(String(event.event_type || 'unknown'));
        html += '<tr>';
        html += `<td>${escapeHtml(ts)}</td>`;
        html += `<td>${actor}</td>`;
        html += `<td>${eventType}</td>`;
        html += `<td>${target}</td>`;
        html += '</tr>';
    });
    adminAuditBody.innerHTML = html;
}

function uniqueNonEmpty(values) {
    const seen = new Set();
    const out = [];
    (Array.isArray(values) ? values : []).forEach((raw) => {
        const value = String(raw || '').trim();
        if (!value) {
            return;
        }
        const key = value.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        out.push(value);
    });
    return out;
}

function setElementVisible(el, visible) {
    if (!el) {
        return;
    }
    el.classList.toggle('hidden', visible === false);
}

function getModelSuggestionsForProvider(provider, ollamaModels) {
    const selected = String(provider || '').trim().toLowerCase();
    if (selected === 'gemini') {
        return ['gemini-1.5-flash', 'gemini-1.5-pro'];
    }
    if (selected === 'openrouter') {
        return ['openrouter/auto', 'openai/gpt-5.4', 'google/gemini-2.5-pro', 'anthropic/claude-sonnet-4'];
    }
    if (selected === 'agent_router') {
        return ['openrouter/auto', 'openai/gpt-5.4', 'google/gemini-2.5-pro'];
    }
    const fromHost = Array.isArray(ollamaModels) ? ollamaModels : [];
    return fromHost.length > 0 ? fromHost : ['llama3.1', 'llama3.1:latest', 'qwen2.5:7b', 'mistral:7b'];
}

function applyDatalistOptions(datalistEl, values) {
    if (!datalistEl) {
        return;
    }
    const options = uniqueNonEmpty(values);
    datalistEl.innerHTML = options.map((value) => `<option value="${escapeHtml(value)}"></option>`).join('');
}

function loadAdminGlobalOllamaModels(forceRefresh) {
    if (!adminSettingOllamaHost || typeof eel === 'undefined' || typeof eel.get_ollama_models !== 'function') {
        return;
    }
    const host = String(adminSettingOllamaHost.value || '').trim();
    if (!forceRefresh && host && host === adminGlobalOllamaModelHostCache && adminGlobalOllamaModelCache.length > 0) {
        return;
    }
    eel.get_ollama_models(host)(function (response) {
        if (!response || !response.success) {
            return;
        }
        adminGlobalOllamaModelHostCache = host;
        adminGlobalOllamaModelCache = uniqueNonEmpty(Array.isArray(response.models) ? response.models : []);
        updateAdminGlobalAiProviderUI(false);
        updateAdminAiValidationHint();
    });
}

function updateAdminGlobalAiProviderUI(forceDefaultModel) {
    if (!adminSettingAiProvider || !adminSettingAiModel) {
        return;
    }
    const provider = String(adminSettingAiProvider.value || '').toLowerCase();
    const usesOpenrouterKey = provider === 'openrouter' || provider === 'agent_router';
    const usesGeminiKey = provider === 'gemini';
    if (adminSettingGeminiKey) {
        adminSettingGeminiKey.disabled = !usesGeminiKey;
    }
    if (adminSettingOpenrouterKey) {
        adminSettingOpenrouterKey.disabled = !usesOpenrouterKey;
    }
    if (adminSettingOllamaHost) {
        adminSettingOllamaHost.disabled = provider !== 'ollama';
    }
    setElementVisible(adminSettingGeminiKey, usesGeminiKey);
    setElementVisible(adminSettingOpenrouterKey, usesOpenrouterKey);
    setElementVisible(adminSettingOllamaHost, provider === 'ollama');

    if (provider === 'gemini') {
        adminSettingAiModel.placeholder = 'gemini-1.5-flash';
    } else if (provider === 'ollama') {
        adminSettingAiModel.placeholder = 'llama3.1';
    } else {
        adminSettingAiModel.placeholder = 'openrouter/auto';
    }

    if (provider === 'ollama') {
        loadAdminGlobalOllamaModels(false);
    }
    applyDatalistOptions(
        adminSettingAiModelList,
        getModelSuggestionsForProvider(provider, provider === 'ollama' ? adminGlobalOllamaModelCache : [])
    );

    if (forceDefaultModel || !String(adminSettingAiModel.value || '').trim()) {
        adminSettingAiModel.value = DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL_BY_PROVIDER.ollama;
    }
}

function getAdminProviderEndpoint(provider, fallbackHost) {
    const selected = String(provider || '').trim().toLowerCase();
    if (selected === 'ollama') {
        return String(fallbackHost || '').trim() || 'http://localhost:11434';
    }
    if (selected === 'gemini') {
        return 'https://generativelanguage.googleapis.com';
    }
    return 'https://openrouter.ai/api/v1/chat/completions';
}

function applyAdminGlobalSettingsForm(settings) {
    const safe = settings && typeof settings === 'object' ? settings : {};
    const editing = safe.editing && typeof safe.editing === 'object' ? safe.editing : {};
    const ai = safe.ai && typeof safe.ai === 'object' ? safe.ai : {};
    if (adminSettingSpelling) adminSettingSpelling.checked = editing.spelling !== false;
    if (adminSettingSentenceCase) adminSettingSentenceCase.checked = editing.sentence_case !== false;
    if (adminSettingPunctuation) adminSettingPunctuation.checked = editing.punctuation !== false;
    if (adminSettingChicagoStyle) adminSettingChicagoStyle.checked = editing.chicago_style !== false;
    if (adminSettingCmosStrict) adminSettingCmosStrict.checked = editing.cmos_strict_mode !== false;
    if (adminSettingDomainProfile) adminSettingDomainProfile.value = String(editing.domain_profile || 'auto');
    if (adminSettingCustomTerms) {
        const terms = Array.isArray(editing.custom_terms) ? editing.custom_terms : [];
        adminSettingCustomTerms.value = normalizeCustomTermsText(terms.join('\n'));
    }
    if (adminSettingAiEnabled) adminSettingAiEnabled.checked = ai.enabled !== false;
    if (adminSettingAiProvider) adminSettingAiProvider.value = String(ai.provider || 'ollama');
    if (adminSettingAiModel) adminSettingAiModel.value = String(ai.model || '');
    if (adminSettingOllamaHost) adminSettingOllamaHost.value = String(ai.ollama_host || 'http://localhost:11434');
    if (adminSettingGeminiKey) adminSettingGeminiKey.value = String(ai.gemini_api_key || '');
    if (adminSettingOpenrouterKey) adminSettingOpenrouterKey.value = String(ai.openrouter_api_key || '');
    if (adminSettingSectionWise) adminSettingSectionWise.checked = ai.section_wise !== false;
    if (adminSettingSectionThresholdChars) adminSettingSectionThresholdChars.value = Number(ai.section_threshold_chars || 12000);
    if (adminSettingSectionThresholdParagraphs) adminSettingSectionThresholdParagraphs.value = Number(ai.section_threshold_paragraphs || 90);
    if (adminSettingSectionChunkChars) adminSettingSectionChunkChars.value = Number(ai.section_chunk_chars || 5500);
    if (adminSettingSectionChunkLines) adminSettingSectionChunkLines.value = Number(ai.section_chunk_lines || 28);
    if (adminSettingGlobalConsistencyMaxChars) adminSettingGlobalConsistencyMaxChars.value = Number(ai.global_consistency_max_chars || 18000);
    updateAdminGlobalAiProviderUI(false);
}

function collectAdminGlobalSettingsForm() {
    return {
        editing: {
            spelling: adminSettingSpelling ? adminSettingSpelling.checked : true,
            sentence_case: adminSettingSentenceCase ? adminSettingSentenceCase.checked : true,
            punctuation: adminSettingPunctuation ? adminSettingPunctuation.checked : true,
            chicago_style: adminSettingChicagoStyle ? adminSettingChicagoStyle.checked : true,
            cmos_strict_mode: adminSettingCmosStrict ? adminSettingCmosStrict.checked : true,
            domain_profile: adminSettingDomainProfile ? String(adminSettingDomainProfile.value || 'auto') : 'auto',
            custom_terms: adminSettingCustomTerms ? parseCustomTerms(adminSettingCustomTerms.value) : []
        },
        ai: {
            enabled: adminSettingAiEnabled ? adminSettingAiEnabled.checked : true,
            provider: adminSettingAiProvider ? String(adminSettingAiProvider.value || 'ollama') : 'ollama',
            model: adminSettingAiModel ? String(adminSettingAiModel.value || '').trim() : '',
            ollama_host: adminSettingOllamaHost ? String(adminSettingOllamaHost.value || '').trim() : '',
            gemini_api_key: adminSettingGeminiKey ? String(adminSettingGeminiKey.value || '').trim() : '',
            openrouter_api_key: adminSettingOpenrouterKey ? String(adminSettingOpenrouterKey.value || '').trim() : '',
            section_wise: adminSettingSectionWise ? adminSettingSectionWise.checked : true,
            section_threshold_chars: clampInt(adminSettingSectionThresholdChars ? adminSettingSectionThresholdChars.value : 12000, 4000, 120000, 12000),
            section_threshold_paragraphs: clampInt(adminSettingSectionThresholdParagraphs ? adminSettingSectionThresholdParagraphs.value : 90, 20, 1000, 90),
            section_chunk_chars: clampInt(adminSettingSectionChunkChars ? adminSettingSectionChunkChars.value : 5500, 1800, 30000, 5500),
            section_chunk_lines: clampInt(adminSettingSectionChunkLines ? adminSettingSectionChunkLines.value : 28, 8, 200, 28),
            global_consistency_max_chars: clampInt(adminSettingGlobalConsistencyMaxChars ? adminSettingGlobalConsistencyMaxChars.value : 18000, 6000, 120000, 18000)
        }
    };
}

function loadAdminGlobalSettings() {
    if (typeof eel === 'undefined' || typeof eel.admin_get_global_settings !== 'function') {
        return;
    }
    if (adminGlobalSettingsStatus) {
        adminGlobalSettingsStatus.textContent = 'Loading global settings...';
        adminGlobalSettingsStatus.style.color = '#ffd58d';
    }
    eel.admin_get_global_settings()(function (response) {
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Could not load global settings';
            if (adminGlobalSettingsStatus) {
                adminGlobalSettingsStatus.textContent = message;
                adminGlobalSettingsStatus.style.color = '#ffb8c2';
            }
            return;
        }
        applyAdminGlobalSettingsForm(response.settings || {});
        if (adminGlobalSettingsStatus) {
            adminGlobalSettingsStatus.textContent = 'Global settings loaded.';
            adminGlobalSettingsStatus.style.color = '#a9f2d3';
        }
    });
}

function saveAdminGlobalSettings() {
    if (typeof eel === 'undefined' || typeof eel.admin_update_global_settings !== 'function') {
        return;
    }
    const settings = collectAdminGlobalSettingsForm();
    if (adminGlobalSettingsStatus) {
        adminGlobalSettingsStatus.textContent = 'Saving global settings...';
        adminGlobalSettingsStatus.style.color = '#ffd58d';
    }
    if (adminSaveGlobalSettingsBtn) {
        adminSaveGlobalSettingsBtn.disabled = true;
    }
    eel.admin_update_global_settings(settings)(function (response) {
        if (adminSaveGlobalSettingsBtn) {
            adminSaveGlobalSettingsBtn.disabled = false;
        }
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Could not save global settings';
            if (adminGlobalSettingsStatus) {
                adminGlobalSettingsStatus.textContent = message;
                adminGlobalSettingsStatus.style.color = '#ffb8c2';
            }
            return;
        }
        runtimeManagedSettings = response.settings || runtimeManagedSettings;
        if (adminGlobalSettingsStatus) {
            adminGlobalSettingsStatus.textContent = 'Global settings saved. New processing jobs now use this config.';
            adminGlobalSettingsStatus.style.color = '#a9f2d3';
        }
    });
}

function refreshAdminUsers() {
    if (!currentUser || String(currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.admin_list_users !== 'function') {
        return;
    }
    eel.admin_list_users(300)(function (response) {
        if (!response || !response.success) {
            return;
        }
        adminUsers = Array.isArray(response.users) ? response.users : [];
        renderAdminUsers();
    });
}

function refreshAdminAudit() {
    if (!currentUser || String(currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.admin_list_audit_events !== 'function') {
        return;
    }
    eel.admin_list_audit_events({ limit: 300 })(function (response) {
        if (!response || !response.success) {
            return;
        }
        adminEvents = Array.isArray(response.events) ? response.events : [];
        renderAdminAudit();
    });
}

function updateAdminUserStatus(userId, nextStatus) {
    if (typeof eel === 'undefined' || typeof eel.admin_set_user_status !== 'function') {
        return;
    }
    eel.admin_set_user_status(userId, nextStatus)(function (response) {
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Could not update user status';
            alert(message);
            return;
        }
        refreshAdminUsers();
        refreshAdminAudit();
    });
}

function updateAdminAiValidationHint() {
    if (!adminAiProviderSelect || !adminAiModelInput || !adminAiKeyInput || !adminAiOllamaHostInput) {
        return;
    }
    const provider = String(adminAiProviderSelect.value || '').toLowerCase();
    const usesRemoteKey = provider === 'openrouter' || provider === 'agent_router' || provider === 'gemini';
    adminAiKeyInput.disabled = !usesRemoteKey;
    adminAiOllamaHostInput.readOnly = provider !== 'ollama';
    adminAiOllamaHostInput.value = getAdminProviderEndpoint(provider, adminAiOllamaHostInput.value);
    adminAiOllamaHostInput.placeholder = provider === 'ollama' ? 'Ollama host' : 'Provider endpoint';
    if (provider === 'gemini') {
        adminAiModelInput.placeholder = 'gemini-1.5-flash';
    } else if (provider === 'ollama') {
        adminAiModelInput.placeholder = 'llama3.1';
    } else {
        adminAiModelInput.placeholder = 'openrouter/auto';
    }
    applyDatalistOptions(
        adminAiModelList,
        getModelSuggestionsForProvider(provider, provider === 'ollama' ? adminGlobalOllamaModelCache : [])
    );
    if (!String(adminAiModelInput.value || '').trim()) {
        adminAiModelInput.value = DEFAULT_MODEL_BY_PROVIDER[provider] || DEFAULT_MODEL_BY_PROVIDER.openrouter;
    }
}

function validateAdminAiProvider() {
    if (!adminAiProviderSelect || !adminAiModelInput || !adminAiKeyInput || !adminAiOllamaHostInput) {
        return;
    }
    if (typeof eel === 'undefined' || typeof eel.admin_validate_ai_provider !== 'function') {
        return;
    }
    const provider = String(adminAiProviderSelect.value || '').trim();
    const payload = {
        provider: provider,
        model: String(adminAiModelInput.value || '').trim(),
        api_key: String(adminAiKeyInput.value || '').trim(),
        ollama_host: String(adminAiOllamaHostInput.value || '').trim()
    };
    if (adminAiValidationResult) {
        adminAiValidationResult.textContent = 'Checking provider...';
        adminAiValidationResult.style.color = '#ffd58d';
    }
    if (adminValidateAiBtn) {
        adminValidateAiBtn.disabled = true;
    }

    eel.admin_validate_ai_provider(payload)(function (response) {
        if (adminValidateAiBtn) {
            adminValidateAiBtn.disabled = false;
        }
        if (!adminAiValidationResult) {
            return;
        }
        if (!response || !response.success) {
            const message = response && response.error ? String(response.error) : 'Validation failed';
            adminAiValidationResult.textContent = message;
            adminAiValidationResult.style.color = '#ffb8c2';
            return;
        }
        const ok = response.valid === true;
        const message = String(response.message || (ok ? 'Provider is reachable.' : 'Provider check failed.'));
        adminAiValidationResult.textContent = message;
        adminAiValidationResult.style.color = ok ? '#a9f2d3' : '#ffb8c2';
    });
}

function openAdminPanel() {
    if (!isAdminDashboardRoute()) {
        navigateToAdminDashboard();
        return;
    }
    applyRouteViewMode();
    setAdminDashboardVisible(true);
    if (!adminPanelBackdrop) {
        return;
    }
    if (adminAiProviderSelect && aiProvider) {
        adminAiProviderSelect.value = String(aiProvider.value || 'openrouter');
    }
    if (adminAiModelInput) {
        adminAiModelInput.value = getCurrentAiModel();
    }
    if (adminAiOllamaHostInput && ollamaHostInput) {
        adminAiOllamaHostInput.value = String(ollamaHostInput.value || 'http://localhost:11434');
    }
    updateAdminGlobalAiProviderUI(false);
    updateAdminAiValidationHint();
    if (adminAiValidationResult) {
        adminAiValidationResult.textContent = 'Run a provider check from server runtime.';
        adminAiValidationResult.style.color = '#a8bddf';
    }
    loadAdminGlobalSettings();
    refreshAdminUsers();
    refreshAdminAudit();
    resetAdminDashboardScroll();
}

function closeAdminPanel() {
    if (isAdminDashboardRoute()) {
        navigateToEditor();
        return;
    }
    setAdminDashboardVisible(false);
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
    const safeAudit = processingAudit && typeof processingAudit === 'object' ? processingAudit : null;
    const auditSummary = safeAudit && safeAudit.summary && typeof safeAudit.summary === 'object'
        ? safeAudit.summary
        : {};
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
        html += `<div class="profile-summary">Strict mode: <strong>${cmosGuardrails.strict_mode ? 'On' : 'Off'}</strong> | Compliance score: <strong>${Number.isFinite(score) ? score : 0}</strong> | Status: <strong>${escapeHtml(statusLabel)}</strong></div>`;
        html += '<div class="profile-rules">';
        html += `<span class="profile-chip">Requested domain: ${escapeHtml(String(cmosGuardrails.requested_domain || 'auto'))}</span>`;
        html += `<span class="profile-chip">Detected domain: ${escapeHtml(String(cmosGuardrails.detected_domain || 'general'))}</span>`;
        html += `<span class="profile-chip">Protected terms: ${Number(cmosGuardrails.protected_terms || 0)}</span>`;
        html += `<span class="profile-chip">Custom terms: ${Number(cmosGuardrails.custom_terms || 0)}</span>`;
        html += '</div>';
        if (warnings.length > 0) {
            html += '<div class="profile-validation">';
            html += '<div class="profile-validation-title">Warnings</div><ul>';
            warnings.forEach((message) => {
                html += `<li>${escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul></div>';
        }
        if (recommendations.length > 0) {
            html += '<div class="profile-validation">';
            html += '<div class="profile-validation-title">Recommended Actions</div><ul>';
            recommendations.forEach((message) => {
                html += `<li>${escapeHtml(String(message || ''))}</li>`;
            });
            html += '</ul></div>';
        }
        if (warnings.length === 0 && recommendations.length === 0) {
            html += '<div class="profile-ok">No CMOS guardrail concerns detected for this run.</div>';
        }
        html += '</section>';
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
        cmos_strict_mode: cmosStrictInput ? cmosStrictInput.checked : true,
        custom_terms_text: normalizeCustomTermsText(customTermsInput.value),
        journal_profile: FIXED_JOURNAL_PROFILE,
        reference_profile: FIXED_JOURNAL_PROFILE,
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
    if (typeof parsed.cmos_strict_mode === 'boolean' && cmosStrictInput) {
        cmosStrictInput.checked = parsed.cmos_strict_mode;
    } else if (cmosStrictInput) {
        cmosStrictInput.checked = true;
    }
    if (typeof parsed.custom_terms_text === 'string') {
        customTermsInput.value = normalizeCustomTermsText(parsed.custom_terms_text);
    }
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
        return;
    }
    if (event.key === 'Escape' && adminPanelBackdrop && !adminPanelBackdrop.classList.contains('hidden')) {
        closeAdminPanel();
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
    cmosStrictInput
].forEach((el) => {
    if (!el) {
        return;
    }
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

if (browseFileBtn) {
    browseFileBtn.addEventListener('click', () => {
        fileInput.click();
    });
}

if (processBtn) {
    processBtn.addEventListener('click', () => {
        process_document();
    });
}

if (saveCleanBtn) {
    saveCleanBtn.addEventListener('click', () => {
        save_file('clean');
    });
}

if (saveHighlightBtn) {
    saveHighlightBtn.addEventListener('click', () => {
        save_file('highlighted');
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        clear_all();
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        logoutCurrentUser();
    });
}

if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', () => {
        refreshTaskHistory();
    });
}

if (openAdminPanelBtn) {
    openAdminPanelBtn.addEventListener('click', () => {
        openAdminPanel();
    });
}

if (adminClosePanelBtn) {
    adminClosePanelBtn.addEventListener('click', () => {
        closeAdminPanel();
    });
}

if (adminRefreshUsersBtn) {
    adminRefreshUsersBtn.addEventListener('click', () => {
        refreshAdminUsers();
    });
}

if (adminRefreshAuditBtn) {
    adminRefreshAuditBtn.addEventListener('click', () => {
        refreshAdminAudit();
    });
}

if (adminLoadGlobalSettingsBtn) {
    adminLoadGlobalSettingsBtn.addEventListener('click', () => {
        loadAdminGlobalSettings();
    });
}

if (adminSaveGlobalSettingsBtn) {
    adminSaveGlobalSettingsBtn.addEventListener('click', () => {
        saveAdminGlobalSettings();
    });
}

if (adminSettingAiProvider) {
    adminSettingAiProvider.addEventListener('change', () => {
        updateAdminGlobalAiProviderUI(true);
    });
}

if (adminSettingOllamaHost) {
    adminSettingOllamaHost.addEventListener('change', () => {
        loadAdminGlobalOllamaModels(true);
    });
}

if (adminAiProviderSelect) {
    adminAiProviderSelect.addEventListener('change', () => {
        updateAdminAiValidationHint();
    });
}

if (adminValidateAiBtn) {
    adminValidateAiBtn.addEventListener('click', () => {
        validateAdminAiProvider();
    });
}

if (adminPanelBackdrop) {
    adminPanelBackdrop.addEventListener('click', (event) => {
        if (!isAdminDashboardRoute() && event.target === adminPanelBackdrop) {
            closeAdminPanel();
        }
    });
}

document.querySelectorAll('.tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const tab = String(btn.dataset.tab || '').trim();
        if (tab) {
            switch_tab(tab);
        }
    });
});

document.querySelectorAll('.view-tab[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const mode = String(btn.dataset.view || '').trim();
        if (mode) {
            switch_view(mode);
        }
    });
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
            fileContent.taskId = String(response.task_id || '');
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
            refreshTaskHistory();
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
                eel.get_redline_preview(fileContent.taskId || '')(function (response) {
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
    fileContent.taskId = String(response.task_id || fileContent.taskId || '');
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
    const options = buildProcessingOptionsFromRuntimeSettings();
    saveAiSettings();

    eel.process_document(options, fileContent.taskId || '')(function(response) {
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
            refreshTaskHistory();
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
        task_id: fileContent.taskId || '',
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
            refreshTaskHistory();
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
    const isBrowserWebMode = window.__MANUSCRIPT_WEB_MODE__ === true;

    function buildSaveErrorMessage(response) {
        const code = response && response.error_code ? String(response.error_code) : 'UNKNOWN_SAVE_ERROR';
        const message = response && response.error ? String(response.error) : 'Unknown save error';
        return `Download failed\nCode: ${code}\nMessage: ${message}`;
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
                alert(buildSaveErrorMessage(response));
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
        task_id: fileContent.taskId || '',
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
            console.warn('Browser download failed:' + code, response.error);
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

    fileContent = {
        taskId: '',
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

updateAdminGlobalAiProviderUI(false);
updateAdminAiValidationHint();
applyRouteViewMode();
checkAuthenticatedUser();

window.addEventListener('pageshow', () => {
    applyRouteViewMode();
    syncAdminDashboardRouteState();
    resetAdminDashboardScroll();
});

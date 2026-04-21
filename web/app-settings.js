const appSettingsRoot = window.ManuscriptEditorApp;
const settingsState = appSettingsRoot.state;
const settingsDom = appSettingsRoot.dom;
const settingsHelpers = appSettingsRoot.helpers;
const settingsConstants = appSettingsRoot.constants;
const previewApi = appSettingsRoot.preview;
const authApi = appSettingsRoot.authAdmin;

function getCurrentAiModel() {
    if (settingsDom.aiProvider.value === 'ollama') {
        return (settingsDom.ollamaModelSelect.value || settingsState.pendingOllamaModelFromStorage || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama).trim();
    }
    if (settingsDom.aiProvider.value === 'openrouter') {
        return (settingsDom.openrouterModelInput.value || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.openrouter).trim();
    }
    if (settingsDom.aiProvider.value === 'agent_router') {
        return (settingsDom.agentRouterModelInput.value || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.agent_router).trim();
    }
    return (settingsDom.geminiModelInput.value || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.gemini).trim();
}

function isLocalOllamaHost(rawHost) {
    const value = (rawHost || '').trim().toLowerCase();
    return !!value && /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(value);
}

function normalizeOllamaHost(rawHost) {
    let value = (rawHost || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
    value = value.replace(/\/+$/, '');
    try {
        const url = new URL(value);
        const port = url.port || '11434';
        return `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
    } catch (err) {
        return '';
    }
}

function updateAiProviderUI() {
    const provider = settingsDom.aiProvider.value;
    settingsDom.ollamaSettings.classList.toggle('hidden', provider !== 'ollama');
    settingsDom.geminiSettings.classList.toggle('hidden', provider !== 'gemini');
    settingsDom.openrouterSettings.classList.toggle('hidden', provider !== 'openrouter');
    settingsDom.agentRouterSettings.classList.toggle('hidden', provider !== 'agent_router');
    settingsDom.ollamaModelSettings.classList.toggle('hidden', provider !== 'ollama');
    settingsDom.geminiModelSettings.classList.toggle('hidden', provider !== 'gemini');
    settingsDom.openrouterModelSettings.classList.toggle('hidden', provider !== 'openrouter');
    settingsDom.agentRouterModelSettings.classList.toggle('hidden', provider !== 'agent_router');

    if (provider === 'ollama') {
        fetchOllamaModels(settingsState.pendingOllamaModelFromStorage || settingsDom.ollamaModelSelect.value || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama);
    } else if (provider === 'gemini' && !(settingsDom.geminiModelInput.value || '').trim()) {
        settingsDom.geminiModelInput.value = settingsConstants.DEFAULT_MODEL_BY_PROVIDER.gemini;
    } else if (provider === 'openrouter' && !(settingsDom.openrouterModelInput.value || '').trim()) {
        settingsDom.openrouterModelInput.value = settingsConstants.DEFAULT_MODEL_BY_PROVIDER.openrouter;
    } else if (provider === 'agent_router' && !(settingsDom.agentRouterModelInput.value || '').trim()) {
        settingsDom.agentRouterModelInput.value = settingsConstants.DEFAULT_MODEL_BY_PROVIDER.agent_router;
    }
}

function applyOllamaHost(host, statusMessage) {
    const normalized = normalizeOllamaHost(host);
    if (!normalized) {
        alert('Invalid host. Use an IP or URL like 192.168.1.25 or http://192.168.1.25:11434');
        return;
    }
    settingsDom.ollamaHostInput.value = normalized;
    settingsDom.aiProvider.value = 'ollama';
    if (!isLocalOllamaHost(normalized)) {
        settingsState.remoteOllamaHostHint = normalized;
    }
    updateAiProviderUI();
    saveAiSettings();
    if (statusMessage) {
        appSettingsRoot.actions.setStatus(statusMessage, 'success');
    }
}

function setOllamaModelOptions(models, preferredModel) {
    settingsDom.ollamaModelSelect.innerHTML = '';
    if (!models || models.length === 0) {
        const fallbackModel = (preferredModel || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama).trim();
        const option = document.createElement('option');
        option.value = fallbackModel;
        option.textContent = fallbackModel;
        settingsDom.ollamaModelSelect.appendChild(option);
        settingsDom.ollamaModelSelect.value = fallbackModel;
        settingsDom.ollamaModelSelect.disabled = true;
        return;
    }
    models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        settingsDom.ollamaModelSelect.appendChild(option);
    });
    settingsDom.ollamaModelSelect.disabled = false;
    settingsDom.ollamaModelSelect.value = preferredModel && models.includes(preferredModel) ? preferredModel : models[0];
}

function fetchOllamaModels(preferredModel) {
    if (typeof eel === 'undefined' || typeof eel.get_ollama_models !== 'function') {
        setOllamaModelOptions([], preferredModel || settingsState.pendingOllamaModelFromStorage || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama);
        settingsDom.ollamaModelHint.textContent = 'Could not detect models automatically. Using default.';
        saveAiSettings();
        return;
    }
    settingsDom.ollamaModelHint.textContent = 'Loading Ollama models...';
    eel.get_ollama_models(settingsDom.ollamaHostInput.value.trim())(function (response) {
        if (response && response.success) {
            const models = Array.isArray(response.models) ? response.models : [];
            const targetModel = (preferredModel || settingsState.pendingOllamaModelFromStorage || response.default_model || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama).trim();
            setOllamaModelOptions(models, targetModel);
            settingsDom.ollamaModelHint.textContent = models.length > 0 ? `Detected ${models.length} model(s).` : 'No Ollama models found. Run: ollama pull llama3.1';
            settingsState.pendingOllamaModelFromStorage = '';
            saveAiSettings();
            return;
        }
        setOllamaModelOptions([], preferredModel || settingsState.pendingOllamaModelFromStorage || settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama);
        settingsDom.ollamaModelHint.textContent = 'Unable to fetch models from Ollama host.';
        settingsState.pendingOllamaModelFromStorage = '';
        saveAiSettings();
    });
}

function saveAiSettings() {
    const normalizedHost = normalizeOllamaHost(settingsDom.ollamaHostInput.value) || settingsDom.ollamaHostInput.value.trim();
    const aiAdvanced = previewApi.readAiAdvancedSettingsFromInputs();
    if (!isLocalOllamaHost(normalizedHost) && normalizedHost) {
        settingsState.remoteOllamaHostHint = normalizedHost;
    }
    const payload = {
        enabled: settingsDom.aiEnabled.checked,
        provider: settingsDom.aiProvider.value,
        model: getCurrentAiModel(),
        ollama_model: (settingsDom.ollamaModelSelect.value || '').trim(),
        gemini_model: (settingsDom.geminiModelInput.value || '').trim(),
        openrouter_model: (settingsDom.openrouterModelInput.value || '').trim(),
        agent_router_model: (settingsDom.agentRouterModelInput.value || '').trim(),
        ollama_host: normalizedHost,
        remote_ollama_host: settingsState.remoteOllamaHostHint,
        api_key: settingsDom.geminiApiKeyInput.value,
        gemini_api_key: settingsDom.geminiApiKeyInput.value,
        openrouter_api_key: settingsDom.openrouterApiKeyInput.value,
        agent_router_api_key: settingsDom.agentRouterApiKeyInput.value,
        ai_advanced: aiAdvanced,
        domain_profile: settingsDom.domainProfileSelect.value || 'auto',
        cmos_strict_mode: settingsDom.cmosStrictInput ? settingsDom.cmosStrictInput.checked : true,
        online_reference_validation: settingsDom.onlineReferenceValidationInput ? settingsDom.onlineReferenceValidationInput.checked !== false : true,
        custom_terms_text: previewApi.normalizeCustomTermsText(settingsDom.customTermsInput.value),
        journal_profile: settingsConstants.FIXED_JOURNAL_PROFILE,
        reference_profile: settingsConstants.FIXED_JOURNAL_PROFILE,
        page_settings: settingsState.pageSettings
    };
    try {
        localStorage.setItem(settingsConstants.SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        // Ignore storage failures.
    }
}

function loadAiSettings() {
    let stored = null;
    try {
        stored = localStorage.getItem(settingsConstants.SETTINGS_STORAGE_KEY);
    } catch (err) {
        stored = null;
    }
    if (!stored) return false;

    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch (err) {
        return false;
    }
    if (!parsed || typeof parsed !== 'object') return false;

    if (typeof parsed.enabled === 'boolean') settingsDom.aiEnabled.checked = parsed.enabled;
    if (['ollama', 'gemini', 'openrouter', 'agent_router'].includes(parsed.provider)) {
        settingsDom.aiProvider.value = parsed.provider;
    }
    const effectiveProvider = parsed.provider || settingsDom.aiProvider.value;
    if (effectiveProvider === 'ollama') {
        const candidate = (typeof parsed.ollama_model === 'string' && parsed.ollama_model.trim())
            ? parsed.ollama_model.trim()
            : ((typeof parsed.model === 'string' && parsed.model.trim()) ? parsed.model.trim() : settingsConstants.DEFAULT_MODEL_BY_PROVIDER.ollama);
        settingsState.pendingOllamaModelFromStorage = candidate === 'llama3.2' ? 'llama3.1' : candidate;
    }
    if (typeof parsed.gemini_model === 'string' && parsed.gemini_model.trim()) {
        settingsDom.geminiModelInput.value = parsed.gemini_model.trim();
    } else if (effectiveProvider === 'gemini' && typeof parsed.model === 'string' && parsed.model.trim()) {
        settingsDom.geminiModelInput.value = parsed.model.trim();
    }
    if (typeof parsed.openrouter_model === 'string' && parsed.openrouter_model.trim()) {
        settingsDom.openrouterModelInput.value = parsed.openrouter_model.trim();
    } else if (effectiveProvider === 'openrouter' && typeof parsed.model === 'string' && parsed.model.trim()) {
        settingsDom.openrouterModelInput.value = parsed.model.trim();
    }
    if (typeof parsed.agent_router_model === 'string' && parsed.agent_router_model.trim()) {
        settingsDom.agentRouterModelInput.value = parsed.agent_router_model.trim();
    } else if (effectiveProvider === 'agent_router' && typeof parsed.model === 'string' && parsed.model.trim()) {
        settingsDom.agentRouterModelInput.value = parsed.model.trim();
    }
    if (typeof parsed.ollama_host === 'string' && parsed.ollama_host.trim()) {
        settingsDom.ollamaHostInput.value = normalizeOllamaHost(parsed.ollama_host.trim()) || parsed.ollama_host.trim();
    }
    if (typeof parsed.remote_ollama_host === 'string' && parsed.remote_ollama_host.trim()) {
        settingsState.remoteOllamaHostHint = normalizeOllamaHost(parsed.remote_ollama_host.trim()) || parsed.remote_ollama_host.trim();
    } else if (!isLocalOllamaHost(settingsDom.ollamaHostInput.value)) {
        settingsState.remoteOllamaHostHint = normalizeOllamaHost(settingsDom.ollamaHostInput.value) || settingsDom.ollamaHostInput.value.trim();
    }
    if (typeof parsed.gemini_api_key === 'string') settingsDom.geminiApiKeyInput.value = parsed.gemini_api_key;
    else if (typeof parsed.api_key === 'string') settingsDom.geminiApiKeyInput.value = parsed.api_key;
    if (typeof parsed.openrouter_api_key === 'string') settingsDom.openrouterApiKeyInput.value = parsed.openrouter_api_key;
    if (typeof parsed.agent_router_api_key === 'string') settingsDom.agentRouterApiKeyInput.value = parsed.agent_router_api_key;
    if (parsed.ai_advanced && typeof parsed.ai_advanced === 'object') {
        previewApi.applyAiAdvancedSettingsToInputs(parsed.ai_advanced);
    } else {
        previewApi.applyAiAdvancedSettingsToInputs(settingsConstants.AI_ADVANCED_DEFAULTS);
    }
    if (['auto', 'general', 'medical', 'engineering', 'law'].includes(parsed.domain_profile)) {
        settingsDom.domainProfileSelect.value = parsed.domain_profile;
    } else {
        settingsDom.domainProfileSelect.value = 'auto';
    }
    settingsDom.cmosStrictInput.checked = typeof parsed.cmos_strict_mode === 'boolean' ? parsed.cmos_strict_mode : true;
    settingsDom.onlineReferenceValidationInput.checked = typeof parsed.online_reference_validation === 'boolean' ? parsed.online_reference_validation : true;
    if (typeof parsed.custom_terms_text === 'string') {
        settingsDom.customTermsInput.value = previewApi.normalizeCustomTermsText(parsed.custom_terms_text);
    }
    settingsState.pageSettings = parsed.page_settings && typeof parsed.page_settings === 'object'
        ? previewApi.sanitizePageSettings(parsed.page_settings)
        : previewApi.sanitizePageSettings({ ...settingsConstants.PAGE_PRESETS.manuscript_default, preset: 'manuscript_default' });
    previewApi.applyPageSettingsToInputs(settingsState.pageSettings);
    previewApi.applyPageStyleVariables();
    return true;
}

function isSetupWizardComplete() {
    try {
        return localStorage.getItem(settingsConstants.FIRST_RUN_SETUP_KEY) === settingsConstants.FIRST_RUN_SETUP_VERSION;
    } catch (err) {
        return false;
    }
}

function markSetupWizardComplete() {
    try {
        localStorage.setItem(settingsConstants.FIRST_RUN_SETUP_KEY, settingsConstants.FIRST_RUN_SETUP_VERSION);
    } catch (err) {
        // Ignore storage failures.
    }
}

function updateSetupWizardProviderUI() {
    if (!settingsDom.setupWizardProvider) {
        return;
    }
    const provider = settingsDom.setupWizardProvider.value;
    settingsDom.setupWizardOllamaBox.classList.toggle('hidden', provider !== 'ollama');
    settingsDom.setupWizardGeminiBox.classList.toggle('hidden', provider !== 'gemini');
    settingsDom.setupWizardOpenrouterBox.classList.toggle('hidden', provider !== 'openrouter');
    settingsDom.setupWizardAgentRouterBox.classList.toggle('hidden', provider !== 'agent_router');
    if (provider === 'ollama') {
        settingsDom.setupWizardHelp.innerHTML = 'Use <strong>localhost</strong> for this PC. Use your LAN IP to connect to Ollama on another computer.';
    } else if (provider === 'gemini') {
        settingsDom.setupWizardHelp.innerHTML = 'Paste your Gemini key from Google AI Studio. Keep this key private.';
    } else if (provider === 'openrouter') {
        settingsDom.setupWizardHelp.innerHTML = 'Paste your OpenRouter API key. Model selection can be changed later in AI Settings.';
    } else {
        settingsDom.setupWizardHelp.innerHTML = 'Paste your AgentRouter token. Model selection can be changed later in AI Settings.';
    }
}

function syncSetupWizardFromCurrentSettings() {
    if (!settingsDom.setupWizardBackdrop) return;
    settingsDom.setupWizardProvider.value = settingsDom.aiProvider.value || 'ollama';
    settingsDom.setupWizardOllamaHostInput.value = normalizeOllamaHost(settingsDom.ollamaHostInput.value) || 'http://localhost:11434';
    settingsDom.setupWizardGeminiKeyInput.value = settingsDom.geminiApiKeyInput.value || '';
    settingsDom.setupWizardOpenrouterKeyInput.value = settingsDom.openrouterApiKeyInput.value || '';
    settingsDom.setupWizardAgentRouterKeyInput.value = settingsDom.agentRouterApiKeyInput.value || '';
    updateSetupWizardProviderUI();
}

function openSetupWizard() {
    if (!settingsDom.setupWizardBackdrop) return;
    syncSetupWizardFromCurrentSettings();
    settingsDom.setupWizardBackdrop.classList.remove('hidden');
}

function closeSetupWizard(markComplete) {
    if (!settingsDom.setupWizardBackdrop) return;
    settingsDom.setupWizardBackdrop.classList.add('hidden');
    if (markComplete) markSetupWizardComplete();
}

function saveSetupWizardSettings() {
    if (!settingsDom.setupWizardProvider) return;
    const provider = settingsDom.setupWizardProvider.value;
    if (provider === 'ollama') {
        const normalizedHost = normalizeOllamaHost(settingsDom.setupWizardOllamaHostInput.value);
        if (!normalizedHost) {
            alert('Please enter a valid Ollama host (example: http://localhost:11434)');
            return;
        }
        settingsDom.ollamaHostInput.value = normalizedHost;
        if (!isLocalOllamaHost(normalizedHost)) settingsState.remoteOllamaHostHint = normalizedHost;
    }
    if (provider === 'gemini') {
        const geminiKey = (settingsDom.setupWizardGeminiKeyInput.value || '').trim();
        if (!geminiKey) return alert('Please paste a Gemini API key.');
        settingsDom.geminiApiKeyInput.value = geminiKey;
    }
    if (provider === 'openrouter') {
        const openrouterKey = (settingsDom.setupWizardOpenrouterKeyInput.value || '').trim();
        if (!openrouterKey) return alert('Please paste an OpenRouter API key.');
        settingsDom.openrouterApiKeyInput.value = openrouterKey;
    }
    if (provider === 'agent_router') {
        const agentRouterKey = (settingsDom.setupWizardAgentRouterKeyInput.value || '').trim();
        if (!agentRouterKey) return alert('Please paste an AgentRouter token.');
        settingsDom.agentRouterApiKeyInput.value = agentRouterKey;
    }
    settingsDom.aiProvider.value = provider;
    settingsDom.aiEnabled.checked = true;
    updateAiProviderUI();
    saveAiSettings();
    closeSetupWizard(true);
    appSettingsRoot.actions.setStatus('Setup saved. You are ready to process documents.', 'success');
}

function maybeShowSetupWizardOnFirstRun() {
    if (!settingsDom.setupWizardBackdrop || isSetupWizardComplete()) return;
    openSetupWizard();
}

function bindSettingsEvents() {
    if (settingsDom.localLoginBtn) {
        settingsDom.localLoginBtn.addEventListener('click', authApi.submitLocalLogin);
    }
    if (settingsDom.localLoginPasswordInput) {
        settingsDom.localLoginPasswordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                authApi.submitLocalLogin();
            }
        });
    }
    settingsDom.aiProvider.addEventListener('change', () => {
        updateAiProviderUI();
        saveAiSettings();
    });
    if (settingsDom.setupWizardProvider) settingsDom.setupWizardProvider.addEventListener('change', updateSetupWizardProviderUI);
    if (settingsDom.openSetupWizardBtn) settingsDom.openSetupWizardBtn.addEventListener('click', openSetupWizard);
    if (settingsDom.setupWizardSaveBtn) settingsDom.setupWizardSaveBtn.addEventListener('click', saveSetupWizardSettings);
    if (settingsDom.setupWizardCancelBtn) settingsDom.setupWizardCancelBtn.addEventListener('click', () => {
        closeSetupWizard(true);
        appSettingsRoot.actions.setStatus('Setup closed. Reopen anytime from AI Settings.', 'warning');
    });
    if (settingsDom.setupWizardSkipBtn) settingsDom.setupWizardSkipBtn.addEventListener('click', () => {
        closeSetupWizard(true);
        appSettingsRoot.actions.setStatus('Setup skipped. You can reopen it anytime from AI Settings.', 'warning');
    });
    if (settingsDom.setupWizardBackdrop) {
        settingsDom.setupWizardBackdrop.addEventListener('click', (event) => {
            if (event.target === settingsDom.setupWizardBackdrop) {
                closeSetupWizard(true);
                appSettingsRoot.actions.setStatus('Setup closed. Reopen anytime from AI Settings.', 'warning');
            }
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && settingsDom.setupWizardBackdrop && !settingsDom.setupWizardBackdrop.classList.contains('hidden')) {
            closeSetupWizard(true);
            appSettingsRoot.actions.setStatus('Setup closed. Reopen anytime from AI Settings.', 'warning');
            return;
        }
        if (event.key === 'Escape' && settingsDom.adminPanelBackdrop && !settingsDom.adminPanelBackdrop.classList.contains('hidden')) {
            authApi.closeAdminPanel();
        }
    });
    settingsDom.refreshModelsBtn.addEventListener('click', () => fetchOllamaModels(settingsDom.ollamaModelSelect.value));
    settingsDom.ollamaHostInput.addEventListener('change', () => fetchOllamaModels(settingsDom.ollamaModelSelect.value));
    settingsDom.ollamaModelSelect.addEventListener('change', saveAiSettings);
    settingsDom.useLocalOllamaBtn.addEventListener('click', () => applyOllamaHost('http://localhost:11434', 'Using local Ollama on this PC'));
    settingsDom.useRemoteOllamaBtn.addEventListener('click', () => {
        const seed = settingsState.remoteOllamaHostHint
            || (!isLocalOllamaHost(settingsDom.ollamaHostInput.value) ? (normalizeOllamaHost(settingsDom.ollamaHostInput.value) || settingsDom.ollamaHostInput.value.trim()) : '')
            || '192.168.1.25:11434';
        const entered = window.prompt('Enter remote Ollama IP/URL (example: 192.168.1.25 or http://192.168.1.25:11434):', seed);
        if (entered !== null) applyOllamaHost(entered, `Using remote Ollama: ${normalizeOllamaHost(entered) || entered}`);
    });
    settingsDom.importCustomTermsBtn.addEventListener('click', () => settingsDom.customTermsFileInput.click());
    settingsDom.clearCustomTermsBtn.addEventListener('click', () => {
        settingsDom.customTermsInput.value = '';
        saveAiSettings();
    });
    settingsDom.customTermsFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
            const merged = previewApi.parseCustomTerms([settingsDom.customTermsInput.value, String(reader.result || '')].join('\n'));
            settingsDom.customTermsInput.value = merged.join('\n');
            saveAiSettings();
        };
        reader.onerror = function () {
            alert('Could not read terms file.');
        };
        reader.readAsText(file);
        settingsDom.customTermsFileInput.value = '';
    });
    settingsDom.pagePresetSelect.addEventListener('change', () => {
        const preset = settingsDom.pagePresetSelect.value;
        if (preset === 'custom') {
            previewApi.onPageSettingsEdited();
            return;
        }
        previewApi.setPagePreset(preset);
        saveAiSettings();
        if (settingsState.currentViewMode === 'page') previewApi.renderCurrentPreview();
    });
    [
        settingsDom.pageFontSizeInput,
        settingsDom.pageLineHeightInput,
        settingsDom.pageParagraphSpacingInput,
        settingsDom.pageMarginTopInput,
        settingsDom.pageMarginBottomInput,
        settingsDom.pageMarginLeftInput,
        settingsDom.pageMarginRightInput
    ].forEach((el) => {
        el.addEventListener('change', previewApi.onPageSettingsEdited);
        el.addEventListener('input', previewApi.onPageSettingsEdited);
    });
    [
        settingsDom.aiEnabled,
        settingsDom.aiProvider,
        settingsDom.geminiModelInput,
        settingsDom.openrouterModelInput,
        settingsDom.agentRouterModelInput,
        settingsDom.ollamaHostInput,
        settingsDom.geminiApiKeyInput,
        settingsDom.openrouterApiKeyInput,
        settingsDom.aiSectionWiseInput,
        settingsDom.aiSectionThresholdCharsInput,
        settingsDom.aiSectionThresholdParagraphsInput,
        settingsDom.aiSectionChunkCharsInput,
        settingsDom.aiSectionChunkLinesInput,
        settingsDom.aiGlobalConsistencyMaxCharsInput,
        settingsDom.domainProfileSelect,
        settingsDom.customTermsInput,
        settingsDom.cmosStrictInput,
        settingsDom.onlineReferenceValidationInput
    ].forEach((el) => {
        if (!el) return;
        el.addEventListener('change', saveAiSettings);
        el.addEventListener('input', saveAiSettings);
    });
    if (settingsDom.browseFileBtn) settingsDom.browseFileBtn.addEventListener('click', () => settingsDom.fileInput.click());
    if (settingsDom.processBtn) settingsDom.processBtn.addEventListener('click', () => appSettingsRoot.actions.process_document());
    if (settingsDom.saveCleanBtn) settingsDom.saveCleanBtn.addEventListener('click', () => appSettingsRoot.actions.save_file('clean'));
    if (settingsDom.saveHighlightBtn) settingsDom.saveHighlightBtn.addEventListener('click', () => appSettingsRoot.actions.save_file('highlighted'));
    if (settingsDom.clearBtn) settingsDom.clearBtn.addEventListener('click', () => appSettingsRoot.actions.clear_all());
    if (settingsDom.logoutBtn) settingsDom.logoutBtn.addEventListener('click', authApi.logoutCurrentUser);
    if (settingsDom.refreshHistoryBtn) settingsDom.refreshHistoryBtn.addEventListener('click', authApi.refreshTaskHistory);
    if (settingsDom.openAdminPanelBtn) settingsDom.openAdminPanelBtn.addEventListener('click', authApi.openAdminPanel);
    if (settingsDom.adminClosePanelBtn) settingsDom.adminClosePanelBtn.addEventListener('click', authApi.closeAdminPanel);
    if (settingsDom.adminRefreshUsersBtn) settingsDom.adminRefreshUsersBtn.addEventListener('click', authApi.refreshAdminUsers);
    if (settingsDom.adminRefreshAuditBtn) settingsDom.adminRefreshAuditBtn.addEventListener('click', authApi.refreshAdminAudit);
    if (settingsDom.adminLoadGlobalSettingsBtn) settingsDom.adminLoadGlobalSettingsBtn.addEventListener('click', authApi.loadAdminGlobalSettings);
    if (settingsDom.adminSaveGlobalSettingsBtn) settingsDom.adminSaveGlobalSettingsBtn.addEventListener('click', authApi.saveAdminGlobalSettings);
    if (settingsDom.adminSettingAiProvider) settingsDom.adminSettingAiProvider.addEventListener('change', () => authApi.updateAdminGlobalAiProviderUI(true));
    if (settingsDom.adminSettingOllamaHost) settingsDom.adminSettingOllamaHost.addEventListener('change', () => authApi.loadAdminGlobalOllamaModels(true));
    if (settingsDom.adminAiProviderSelect) settingsDom.adminAiProviderSelect.addEventListener('change', authApi.updateAdminAiValidationHint);

    authApi.bindPasswordToggle(settingsDom.adminAiKeyInput, settingsDom.adminAiKeyToggleBtn, { show: 'Show', hide: 'Hide', showAria: 'Show API key', hideAria: 'Hide API key' });
    authApi.bindPasswordToggle(settingsDom.adminSettingGeminiKey, settingsDom.adminSettingGeminiKeyToggleBtn, { show: 'Show', hide: 'Hide', showAria: 'Show Gemini API key', hideAria: 'Hide Gemini API key' });
    authApi.bindPasswordToggle(settingsDom.adminSettingOpenrouterKey, settingsDom.adminSettingOpenrouterKeyToggleBtn, { show: 'Show', hide: 'Hide', showAria: 'Show OpenRouter API key', hideAria: 'Hide OpenRouter API key' });
    authApi.bindPasswordToggle(settingsDom.adminSettingAgentRouterKey, settingsDom.adminSettingAgentRouterKeyToggleBtn, { show: 'Show', hide: 'Hide', showAria: 'Show AgentRouter token', hideAria: 'Hide AgentRouter token' });

    if (settingsDom.adminValidateAiBtn) settingsDom.adminValidateAiBtn.addEventListener('click', authApi.validateAdminAiProvider);
    if (settingsDom.adminPanelBackdrop) {
        settingsDom.adminPanelBackdrop.addEventListener('click', (event) => {
            if (!authApi.isAdminDashboardRoute() && event.target === settingsDom.adminPanelBackdrop) {
                authApi.closeAdminPanel();
            }
        });
    }
    document.querySelectorAll('.tab[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = String(btn.dataset.tab || '').trim();
            if (tab) appSettingsRoot.actions.switch_tab(tab);
        });
    });
    document.querySelectorAll('.view-tab[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = String(btn.dataset.view || '').trim();
            if (mode) appSettingsRoot.actions.switch_view(mode);
        });
    });
    settingsDom.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        settingsDom.dropZone.classList.add('dragover');
    });
    settingsDom.dropZone.addEventListener('dragleave', () => settingsDom.dropZone.classList.remove('dragover'));
    settingsDom.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        settingsDom.dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) appSettingsRoot.actions.handleFile(files[0]);
    });
    settingsDom.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) appSettingsRoot.actions.handleFile(e.target.files[0]);
    });
}

previewApi.applyAiAdvancedSettingsToInputs(settingsConstants.AI_ADVANCED_DEFAULTS);
loadAiSettings();
if (!settingsDom.pagePresetSelect.value) {
    previewApi.setPagePreset('manuscript_default');
}
updateAiProviderUI();
bindSettingsEvents();

appSettingsRoot.settings = {
    getCurrentAiModel,
    isLocalOllamaHost,
    normalizeOllamaHost,
    updateAiProviderUI,
    applyOllamaHost,
    setOllamaModelOptions,
    fetchOllamaModels,
    saveAiSettings,
    loadAiSettings,
    isSetupWizardComplete,
    markSetupWizardComplete,
    updateSetupWizardProviderUI,
    syncSetupWizardFromCurrentSettings,
    openSetupWizard,
    closeSetupWizard,
    saveSetupWizardSettings,
    maybeShowSetupWizardOnFirstRun
};

const appAdminRuntimeRoot = window.ManuscriptEditorApp;
const adminRuntimeState = appAdminRuntimeRoot.state;
const adminRuntimeDom = appAdminRuntimeRoot.dom;
const adminRuntimeConstants = appAdminRuntimeRoot.constants;

function callRuntimeApiOrEel(apiInvoker, eelMethod, eelArgs, callback) {
    return appAdminRuntimeRoot.authAdmin.callApiOrEel(apiInvoker, eelMethod, eelArgs, callback);
}

function refreshRuntimeSettings(callback) {
    const called = callRuntimeApiOrEel(
        (api) => api.runtime && typeof api.runtime.settings === 'function' ? api.runtime.settings() : null,
        'get_runtime_settings',
        [],
        function (response) {
            if (response && response.success && response.settings && typeof response.settings === 'object') {
                adminRuntimeState.runtimeManagedSettings = response.settings;
                if (typeof callback === 'function') {
                    callback(adminRuntimeState.runtimeManagedSettings);
                }
                return;
            }
            adminRuntimeState.runtimeManagedSettings = null;
            if (typeof callback === 'function') {
                callback(null);
            }
        }
    );
    if (!called) {
        adminRuntimeState.runtimeManagedSettings = null;
        if (typeof callback === 'function') {
            callback(null);
        }
    }
}

function buildProcessingOptionsFromRuntimeSettings() {
    const settings = adminRuntimeState.runtimeManagedSettings && typeof adminRuntimeState.runtimeManagedSettings === 'object'
        ? adminRuntimeState.runtimeManagedSettings
        : null;
    const editing = settings && settings.editing && typeof settings.editing === 'object' ? settings.editing : {};
    const onlineReferenceValidationEnabled = settings
        ? editing.online_reference_validation !== false
        : (adminRuntimeDom.onlineReferenceValidationInput ? adminRuntimeDom.onlineReferenceValidationInput.checked !== false : true);
    const serperFallbackEnabled = settings
        ? editing.online_reference_serper_fallback !== false
        : (adminRuntimeDom.onlineReferenceSerperFallbackInput
            ? adminRuntimeDom.onlineReferenceSerperFallbackInput.checked !== false
            : onlineReferenceValidationEnabled);
    const defaults = {
        spelling: true,
        sentence_case: true,
        punctuation: true,
        chicago_style: true,
        cmos_strict_mode: true,
        online_reference_validation: onlineReferenceValidationEnabled,
        online_reference_serper_fallback: serperFallbackEnabled,
        doi_insertion_mode: 'balanced',
        domain_profile: 'auto',
        cmos_profile: 'core',
        custom_terms: [],
        journal_profile: adminRuntimeConstants.FIXED_JOURNAL_PROFILE,
        reference_profile: adminRuntimeConstants.FIXED_JOURNAL_PROFILE,
        ai: {
            enabled: true,
            provider: 'ollama',
            model: adminRuntimeConstants.DEFAULT_MODEL_BY_PROVIDER.ollama,
            ollama_host: 'http://localhost:11434',
            api_key: '',
            gemini_api_key: '',
            openrouter_api_key: '',
            agent_router_api_key: '',
            ai_first_cmos: false,
            section_wise: true,
            section_threshold_chars: 12000,
            section_threshold_paragraphs: 90,
            section_chunk_chars: 5500,
            section_chunk_lines: 28,
            global_consistency_max_chars: 18000,
            ollama_generate_timeout_seconds: 60,
            ollama_health_timeout_seconds: 5,
            ollama_retry_count: 0,
            ollama_retry_backoff_seconds: 0,
            ollama_fallback_model_retry: true
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
        online_reference_serper_fallback: serperFallbackEnabled,
        doi_insertion_mode: editing.doi_insertion_mode === 'strict' ? 'strict' : 'balanced',
        domain_profile: String(editing.domain_profile || 'auto'),
        cmos_profile: ['core', 'strict', 'journal_custom'].includes(String(editing.cmos_profile || 'core'))
            ? String(editing.cmos_profile || 'core')
            : 'core',
        custom_terms: Array.isArray(editing.custom_terms) ? editing.custom_terms : [],
        journal_profile: adminRuntimeConstants.FIXED_JOURNAL_PROFILE,
        reference_profile: adminRuntimeConstants.FIXED_JOURNAL_PROFILE,
        ai: {
            enabled: ai.enabled !== false,
            provider: String(ai.provider || 'ollama'),
            model: String(ai.model || ''),
            ollama_host: String(ai.ollama_host || ''),
            api_key: String(ai.gemini_api_key || ''),
            gemini_api_key: String(ai.gemini_api_key || ''),
            openrouter_api_key: String(ai.openrouter_api_key || ''),
            agent_router_api_key: String(ai.agent_router_api_key || ''),
            ai_first_cmos: ai.ai_first_cmos === true,
            section_wise: ai.section_wise !== false,
            section_threshold_chars: Number(ai.section_threshold_chars || 12000),
            section_threshold_paragraphs: Number(ai.section_threshold_paragraphs || 90),
            section_chunk_chars: Number(ai.section_chunk_chars || 5500),
            section_chunk_lines: Number(ai.section_chunk_lines || 28),
            global_consistency_max_chars: Number(ai.global_consistency_max_chars || 18000),
            ollama_generate_timeout_seconds: Number(ai.ollama_generate_timeout_seconds || 60),
            ollama_health_timeout_seconds: Number(ai.ollama_health_timeout_seconds || 5),
            ollama_retry_count: Number(ai.ollama_retry_count || 0),
            ollama_retry_backoff_seconds: Number(ai.ollama_retry_backoff_seconds || 0),
            ollama_fallback_model_retry: ai.ollama_fallback_model_retry !== false
        }
    };
}

appAdminRuntimeRoot.adminRuntime = {
    refreshRuntimeSettings,
    buildProcessingOptionsFromRuntimeSettings
};

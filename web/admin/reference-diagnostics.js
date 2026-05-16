const appAdminReferenceRoot = window.ManuscriptEditorApp;
const adminReferenceState = appAdminReferenceRoot.state;
const adminReferenceDom = appAdminReferenceRoot.dom;

function callReferenceApiOrEel(apiInvoker, eelMethod, eelArgs, callback) {
    return appAdminReferenceRoot.authAdmin.callApiOrEel(apiInvoker, eelMethod, eelArgs, callback);
}

function renderAdminReferenceValidationDiagnostics(payload) {
    if (!adminReferenceDom.adminReferenceDiagnosticsOutput) {
        return;
    }
    const safe = payload && typeof payload === 'object' ? payload : {};
    try {
        adminReferenceDom.adminReferenceDiagnosticsOutput.textContent = JSON.stringify(safe, null, 2);
    } catch (_err) {
        adminReferenceDom.adminReferenceDiagnosticsOutput.textContent = String(safe);
    }
    const trends = safe.unresolved_trends && typeof safe.unresolved_trends === 'object'
        ? safe.unresolved_trends
        : {};
    if (adminReferenceDom.adminReferenceUnresolvedTrendSummary) {
        const runs = Number(trends.window_runs || 0);
        const bySource = trends.totals_by_source && typeof trends.totals_by_source === 'object' ? trends.totals_by_source : {};
        const topSource = Object.entries(bySource).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))[0];
        adminReferenceDom.adminReferenceUnresolvedTrendSummary.textContent = runs > 0
            ? `Unresolved trends: last ${runs} runs. Top source: ${topSource ? `${topSource[0]} (${topSource[1]})` : 'n/a'}.`
            : 'Unresolved trends: no runs yet.';
    }
    if (adminReferenceDom.adminReferenceDiagnosticsTrendsOutput) {
        const compact = {
            window_runs: Number(trends.window_runs || 0),
            totals_by_source: trends.totals_by_source || {},
            totals_by_reason: trends.totals_by_reason || {},
            runs: Array.isArray(trends.runs) ? trends.runs : []
        };
        try {
            adminReferenceDom.adminReferenceDiagnosticsTrendsOutput.textContent = JSON.stringify(compact, null, 2);
        } catch (_err) {
            adminReferenceDom.adminReferenceDiagnosticsTrendsOutput.textContent = String(compact);
        }
    }
}

function refreshAdminReferenceValidationDiagnostics() {
    if (!adminReferenceState.currentUser || String(adminReferenceState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (adminReferenceDom.adminReferenceDiagnosticsStatus) {
        adminReferenceDom.adminReferenceDiagnosticsStatus.textContent = 'Loading reference diagnostics...';
        adminReferenceDom.adminReferenceDiagnosticsStatus.style.color = '#ffd58d';
    }
    if (adminReferenceDom.adminRefreshReferenceDiagnosticsBtn) {
        adminReferenceDom.adminRefreshReferenceDiagnosticsBtn.disabled = true;
    }
    callReferenceApiOrEel(
        (api) => api.admin && typeof api.admin.referenceValidationDiagnostics === 'function' ? api.admin.referenceValidationDiagnostics() : null,
        'admin_get_reference_validation_diagnostics',
        [],
        function (response) {
            if (adminReferenceDom.adminRefreshReferenceDiagnosticsBtn) {
                adminReferenceDom.adminRefreshReferenceDiagnosticsBtn.disabled = false;
            }
            if (!response || !response.success) {
                const message = response && response.error ? String(response.error) : 'Could not load reference diagnostics';
                if (adminReferenceDom.adminReferenceDiagnosticsStatus) {
                    adminReferenceDom.adminReferenceDiagnosticsStatus.textContent = message;
                    adminReferenceDom.adminReferenceDiagnosticsStatus.style.color = '#ffb8c2';
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
            if (adminReferenceDom.adminReferenceDiagnosticsStatus) {
                adminReferenceDom.adminReferenceDiagnosticsStatus.textContent = configured
                    ? (effective ? 'Serper fallback is effectively enabled by current settings.' : 'Serper key is configured, but runtime settings currently disable fallback.')
                    : 'SERPER_API_KEY is not configured in server runtime.';
                adminReferenceDom.adminReferenceDiagnosticsStatus.style.color = configured
                    ? (effective ? '#a9f2d3' : '#ffd58d')
                    : '#ffb8c2';
            }
        }
    );
}

function resetAdminReferenceValidationDiagnostics() {
    if (!adminReferenceState.currentUser || String(adminReferenceState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    if (adminReferenceDom.adminReferenceDiagnosticsStatus) {
        adminReferenceDom.adminReferenceDiagnosticsStatus.textContent = 'Resetting reference diagnostics cache...';
        adminReferenceDom.adminReferenceDiagnosticsStatus.style.color = '#ffd58d';
    }
    if (adminReferenceDom.adminResetReferenceDiagnosticsBtn) {
        adminReferenceDom.adminResetReferenceDiagnosticsBtn.disabled = true;
    }
    if (adminReferenceDom.adminRefreshReferenceDiagnosticsBtn) {
        adminReferenceDom.adminRefreshReferenceDiagnosticsBtn.disabled = true;
    }
    callReferenceApiOrEel(
        (api) => api.admin && typeof api.admin.resetReferenceValidationDiagnostics === 'function' ? api.admin.resetReferenceValidationDiagnostics() : null,
        'admin_reset_reference_validation_diagnostics',
        [],
        function (response) {
            if (adminReferenceDom.adminResetReferenceDiagnosticsBtn) {
                adminReferenceDom.adminResetReferenceDiagnosticsBtn.disabled = false;
            }
            if (adminReferenceDom.adminRefreshReferenceDiagnosticsBtn) {
                adminReferenceDom.adminRefreshReferenceDiagnosticsBtn.disabled = false;
            }
            if (!response || !response.success) {
                const message = response && response.error ? String(response.error) : 'Could not reset reference diagnostics cache';
                if (adminReferenceDom.adminReferenceDiagnosticsStatus) {
                    adminReferenceDom.adminReferenceDiagnosticsStatus.textContent = message;
                    adminReferenceDom.adminReferenceDiagnosticsStatus.style.color = '#ffb8c2';
                }
                return;
            }
            const diagnostics = response.diagnostics && typeof response.diagnostics === 'object'
                ? response.diagnostics
                : {};
            renderAdminReferenceValidationDiagnostics(diagnostics);
            const removed = Number(response.removed_cache_entries || 0);
            if (adminReferenceDom.adminReferenceDiagnosticsStatus) {
                adminReferenceDom.adminReferenceDiagnosticsStatus.textContent = `Diagnostics cache reset completed. Removed ${removed} entr${removed === 1 ? 'y' : 'ies'}.`;
                adminReferenceDom.adminReferenceDiagnosticsStatus.style.color = '#a9f2d3';
            }
        }
    );
}

appAdminReferenceRoot.adminReferenceDiagnostics = {
    renderAdminReferenceValidationDiagnostics,
    refreshAdminReferenceValidationDiagnostics,
    resetAdminReferenceValidationDiagnostics
};

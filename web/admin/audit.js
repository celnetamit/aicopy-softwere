const appAdminAuditRoot = window.ManuscriptEditorApp;
const adminAuditState = appAdminAuditRoot.state;
const adminAuditDom = appAdminAuditRoot.dom;
const adminAuditHelpers = appAdminAuditRoot.helpers;

function callAuditApiOrEel(apiInvoker, eelMethod, eelArgs, callback) {
    return appAdminAuditRoot.authAdmin.callApiOrEel(apiInvoker, eelMethod, eelArgs, callback);
}

function renderAdminAudit() {
    if (!adminAuditDom.adminAuditBody) {
        return;
    }
    if (!Array.isArray(adminAuditState.adminEvents) || adminAuditState.adminEvents.length === 0) {
        adminAuditDom.adminAuditBody.innerHTML = '<tr><td colspan="4">No events found.</td></tr>';
        return;
    }
    let html = '';
    adminAuditState.adminEvents.forEach((event) => {
        html += '<tr>';
        html += `<td>${adminAuditHelpers.escapeHtml(adminAuditHelpers.formatUnixTimestamp(event.created_at))}</td>`;
        html += `<td>${adminAuditHelpers.escapeHtml(String(event.actor_email || '-'))}</td>`;
        html += `<td>${adminAuditHelpers.escapeHtml(String(event.event_type || 'unknown'))}</td>`;
        html += `<td>${adminAuditHelpers.escapeHtml(String(event.target_email || '-'))}</td>`;
        html += '</tr>';
    });
    adminAuditDom.adminAuditBody.innerHTML = html;
}

function refreshAdminAudit() {
    if (!adminAuditState.currentUser || String(adminAuditState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    callAuditApiOrEel(
        (api) => api.admin && typeof api.admin.auditEvents === 'function' ? api.admin.auditEvents({ limit: 300 }) : null,
        'admin_list_audit_events',
        [{ limit: 300 }],
        function (response) {
            if (!response || !response.success) {
                return;
            }
            adminAuditState.adminEvents = Array.isArray(response.events) ? response.events : [];
            renderAdminAudit();
        }
    );
}

appAdminAuditRoot.adminAudit = {
    renderAdminAudit,
    refreshAdminAudit
};

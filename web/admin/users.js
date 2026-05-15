const appAdminUsersRoot = window.ManuscriptEditorApp;
const adminUsersState = appAdminUsersRoot.state;
const adminUsersDom = appAdminUsersRoot.dom;
const adminUsersHelpers = appAdminUsersRoot.helpers;

function callUsersApiOrEel(apiInvoker, eelMethod, eelArgs, callback) {
    return appAdminUsersRoot.authAdmin.callApiOrEel(apiInvoker, eelMethod, eelArgs, callback);
}

function refreshAuditAfterUserChange() {
    const auditModule = appAdminUsersRoot.adminAudit || {};
    if (typeof auditModule.refreshAdminAudit === 'function') {
        auditModule.refreshAdminAudit();
    }
}

function renderAdminUsers() {
    if (!adminUsersDom.adminUsersBody) {
        return;
    }
    if (!Array.isArray(adminUsersState.adminUsers) || adminUsersState.adminUsers.length === 0) {
        adminUsersDom.adminUsersBody.innerHTML = '<tr><td colspan="4">No users found.</td></tr>';
        return;
    }
    let html = '';
    adminUsersState.adminUsers.forEach((user) => {
        const userId = adminUsersHelpers.escapeHtml(String(user.id || ''));
        const status = String(user.status || 'ACTIVE').toUpperCase();
        const isActive = status === 'ACTIVE';
        const role = adminUsersHelpers.escapeHtml(String(user.role || 'USER'));
        const email = adminUsersHelpers.escapeHtml(String(user.email || ''));
        const statusClass = isActive ? 'active' : 'inactive';
        const actionLabel = isActive ? 'Deactivate' : 'Activate';
        const nextStatus = isActive ? 'INACTIVE' : 'ACTIVE';
        html += '<tr>';
        html += `<td>${email}<br><small>${adminUsersHelpers.escapeHtml(String(user.display_name || ''))}</small></td>`;
        html += `<td>${role}</td>`;
        html += `<td><span class="status-pill ${statusClass}">${adminUsersHelpers.escapeHtml(status)}</span></td>`;
        html += `<td><button class="btn-secondary btn-small" data-user-id="${userId}" data-next-status="${nextStatus}">${actionLabel}</button></td>`;
        html += '</tr>';
    });
    adminUsersDom.adminUsersBody.innerHTML = html;
    adminUsersDom.adminUsersBody.querySelectorAll('button[data-user-id][data-next-status]').forEach((button) => {
        button.addEventListener('click', () => {
            const userId = String(button.getAttribute('data-user-id') || '').trim();
            const nextStatus = String(button.getAttribute('data-next-status') || '').trim();
            if (userId && nextStatus) {
                updateAdminUserStatus(userId, nextStatus);
            }
        });
    });
}

function refreshAdminUsers() {
    if (!adminUsersState.currentUser || String(adminUsersState.currentUser.role || '').toUpperCase() !== 'ADMIN') {
        return;
    }
    callUsersApiOrEel(
        (api) => api.admin && typeof api.admin.users === 'function' ? api.admin.users(300) : null,
        'admin_list_users',
        [300],
        function (response) {
            if (!response || !response.success) {
                return;
            }
            adminUsersState.adminUsers = Array.isArray(response.users) ? response.users : [];
            renderAdminUsers();
        }
    );
}

function updateAdminUserStatus(userId, nextStatus) {
    callUsersApiOrEel(
        (api) => api.admin && typeof api.admin.setUserStatus === 'function' ? api.admin.setUserStatus(userId, nextStatus) : null,
        'admin_set_user_status',
        [userId, nextStatus],
        function (response) {
            if (!response || !response.success) {
                alert(response && response.error ? String(response.error) : 'Could not update user status');
                return;
            }
            refreshAdminUsers();
            refreshAuditAfterUserChange();
        }
    );
}

appAdminUsersRoot.adminUsers = {
    renderAdminUsers,
    refreshAdminUsers,
    updateAdminUserStatus
};

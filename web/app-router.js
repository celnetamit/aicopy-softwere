(function () {
    const root = window.ManuscriptEditorApp || (window.ManuscriptEditorApp = {});

    function getAuth() {
        return root.authAdmin || root.auth || {};
    }

    function getActions() {
        return root.actions && typeof root.actions === 'object' ? root.actions : {};
    }

    function callAuth(name) {
        const auth = getAuth();
        const fn = auth[name];
        if (typeof fn !== 'function') {
            return undefined;
        }
        return fn.apply(auth, Array.prototype.slice.call(arguments, 1));
    }

    function callAction(name) {
        const actions = getActions();
        const fn = actions[name];
        if (typeof fn !== 'function') {
            return undefined;
        }
        return fn.apply(actions, Array.prototype.slice.call(arguments, 1));
    }

    function getRouteName() {
        const auth = getAuth();
        if (auth && typeof auth.isAdminDashboardRoute === 'function' && auth.isAdminDashboardRoute()) {
            return 'admin';
        }
        if (auth && typeof auth.isTaskDetailRoute === 'function' && auth.isTaskDetailRoute()) {
            return 'task-detail';
        }
        if (auth && typeof auth.isTasksDashboardRoute === 'function' && auth.isTasksDashboardRoute()) {
            return 'tasks';
        }
        return 'unknown';
    }

    function initRouteModules() {
        const pages = root.pages || {};
        if (pages.tasks && typeof pages.tasks.init === 'function') {
            pages.tasks.init();
        }
        if (pages.taskDetail && typeof pages.taskDetail.init === 'function') {
            pages.taskDetail.init();
        }
    }

    function bootstrapFallbackSurface() {
        callAction('updateAssistantRouteHint');
        callAction('updateAssistantDiagnostics', 'idle', 'none', 0);
        callAction('setAssistantUnreadCount', 0);
    }

    function bootstrapRouteSurface() {
        const pages = root.pages || {};
        const taskDetailPage = pages.taskDetail || {};
        if (typeof taskDetailPage.bootstrapEditorSurface === 'function' && taskDetailPage.bootstrapEditorSurface()) {
            return;
        }
        bootstrapFallbackSurface();
    }

    function bootstrap() {
        callAuth('updateAdminGlobalAiProviderUI', false);
        callAuth('updateAdminAiValidationHint');
        callAuth('applyRouteViewMode');
        initRouteModules();
        bootstrapRouteSurface();
        callAuth('checkAuthenticatedUser');
        callAction('refreshProcessButtonState');
    }

    function handlePageShow() {
        callAuth('applyRouteViewMode');
        const pages = root.pages || {};
        const taskDetailPage = pages.taskDetail || {};
        const editorPageShown = typeof taskDetailPage.handlePageShow === 'function'
            ? taskDetailPage.handlePageShow()
            : false;
        if (!editorPageShown) {
            callAction('updateAssistantRouteHint');
            callAction('restoreAssistantChatHistoryForCurrentTask');
        }
        callAuth('syncAdminDashboardRouteState');
        callAuth('resetAdminDashboardScroll');
    }

    root.router = {
        getRouteName,
        initRouteModules,
        bootstrap,
        handlePageShow
    };

    bootstrap();
    window.addEventListener('pageshow', handlePageShow);
})();

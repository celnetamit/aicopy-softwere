(function () {
    if (typeof window === 'undefined') {
        return;
    }

    // Upgrade-safe bridge bootstrap:
    // if an older script already defined window.eel, merge/override required methods.
    var eelObj = (window.eel && typeof window.eel === 'object') ? window.eel : {};
    if (typeof eelObj.expose !== 'function') {
        eelObj.expose = function () {};
    }

    function responseToJson(response) {
        return response.text().then(function (text) {
            if (!text) {
                return { success: response.ok };
            }
            try {
                return JSON.parse(text);
            } catch (err) {
                return {
                    success: false,
                    error: 'Invalid JSON response from server',
                    raw: text
                };
            }
        });
    }

    function requestJson(url, options) {
        var requestOptions = options || { credentials: 'same-origin' };
        requestOptions.credentials = requestOptions.credentials || 'same-origin';

        return fetch(url, requestOptions)
            .then(responseToJson)
            .catch(function (err) {
                return {
                    success: false,
                    error: String(err && err.message ? err.message : err)
                };
            });
    }

    function getJson(url) {
        return requestJson(url, {
            credentials: 'same-origin'
        });
    }

    function postJson(url, payload) {
        return requestJson(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
        });
    }

    function withCallback(promise, callback) {
        return Promise.resolve(promise)
            .then(function (payload) {
                if (typeof callback === 'function') {
                    callback(payload);
                }
                return payload;
            })
            .catch(function (err) {
                var payload = {
                    success: false,
                    error: String(err && err.message ? err.message : err)
                };
                if (typeof callback === 'function') {
                    callback(payload);
                }
                return payload;
            });
    }

    function callbackWrapper(handler) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return function (callback) {
                return withCallback(handler.apply(null, args), callback);
            };
        };
    }

    var bridgeApi = {
        expose: eelObj.expose,

        auth_google_login: callbackWrapper(function (idToken) {
            return postJson('/api/auth/google-login', {
                id_token: idToken
            });
        }),

        auth_config: callbackWrapper(function () {
            return getJson('/api/auth/config');
        }),

        auth_me: callbackWrapper(function () {
            return getJson('/api/auth/me');
        }),

        auth_logout: callbackWrapper(function () {
            return postJson('/api/auth/logout', {});
        }),

        load_text_content: callbackWrapper(function (fileName, content) {
            return postJson('/api/tasks/upload-text', {
                file_name: fileName,
                content: content
            });
        }),

        load_docx_content: callbackWrapper(function (fileName, base64Data) {
            return postJson('/api/tasks/upload-docx', {
                file_name: fileName,
                base64_data: base64Data
            });
        }),

        process_document: callbackWrapper(function (options, taskId) {
            if (taskId) {
                return postJson('/api/tasks/' + encodeURIComponent(taskId) + '/process', {
                    options: options
                });
            }
            return postJson('/api/process-document', {
                options: options,
                task_id: taskId || '',
                source_text: (window.fileContent && window.fileContent.original) || '',
                source_file_name: (window.fileContent && window.fileContent.fileName) || ''
            });
        }),

        apply_correction_group_decisions: callbackWrapper(function (payload) {
            var requestPayload = payload || {};
            var taskId = requestPayload.task_id || (window.fileContent && window.fileContent.taskId) || '';
            if (taskId) {
                return postJson('/api/tasks/' + encodeURIComponent(taskId) + '/apply-correction-group-decisions', {
                    group_decisions: requestPayload.group_decisions || requestPayload || {},
                    full_corrected_text: requestPayload.full_corrected_text || ''
                });
            }
            return postJson('/api/apply-correction-group-decisions', {
                task_id: taskId,
                group_decisions: requestPayload.group_decisions || requestPayload || {},
                full_corrected_text: requestPayload.full_corrected_text || '',
                original_text: requestPayload.original_text || ''
            });
        }),

        get_redline_preview: callbackWrapper(function (taskId) {
            var query = '';
            if (taskId) {
                query = '?task_id=' + encodeURIComponent(taskId);
            }
            return getJson('/api/redline-preview' + query);
        }),

        get_ollama_models: callbackWrapper(function (ollamaHost) {
            var query = '';
            if (ollamaHost) {
                query = '?ollama_host=' + encodeURIComponent(ollamaHost);
            }
            return getJson('/api/ollama-models' + query);
        }),

        export_file: callbackWrapper(function (payload) {
            var input = payload;
            if (typeof input === 'string') {
                input = { file_type: input };
            }
            input = input || {};

            var taskId = input.task_id || (window.fileContent && window.fileContent.taskId) || '';
            var fileType = input.file_type || 'clean';
            if (taskId) {
                var url = '/api/tasks/' + encodeURIComponent(taskId) + '/download?type=' + encodeURIComponent(fileType);
                return getJson(url);
            }

            return postJson('/api/export-file', {
                task_id: taskId,
                file_type: fileType,
                original_text: input.original_text || '',
                corrected_text: input.corrected_text || '',
                file_name: input.file_name || ''
            });
        }),

        save_file: callbackWrapper(function (fileType) {
            return postJson('/api/save-file', {
                file_type: fileType
            });
        }),

        list_tasks: callbackWrapper(function (limit) {
            var safeLimit = Number(limit || 100);
            if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
                safeLimit = 100;
            }
            safeLimit = Math.min(250, Math.max(1, Math.floor(safeLimit)));
            return getJson('/api/tasks?limit=' + encodeURIComponent(String(safeLimit)));
        }),

        get_task: callbackWrapper(function (taskId) {
            return getJson('/api/tasks/' + encodeURIComponent(taskId));
        }),

        admin_list_users: callbackWrapper(function (limit) {
            var safeLimit = Number(limit || 200);
            if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
                safeLimit = 200;
            }
            safeLimit = Math.min(500, Math.max(1, Math.floor(safeLimit)));
            return getJson('/api/admin/users?limit=' + encodeURIComponent(String(safeLimit)));
        }),

        admin_set_user_status: callbackWrapper(function (userId, status) {
            return postJson('/api/admin/users/' + encodeURIComponent(userId) + '/status', {
                status: status
            });
        }),

        admin_list_audit_events: callbackWrapper(function (query) {
            var q = query || {};
            var params = [];
            if (q.limit) {
                params.push('limit=' + encodeURIComponent(String(q.limit)));
            }
            if (q.actor_user_id) {
                params.push('actor_user_id=' + encodeURIComponent(String(q.actor_user_id)));
            }
            if (q.event_type) {
                params.push('event_type=' + encodeURIComponent(String(q.event_type)));
            }
            if (q.date_from) {
                params.push('date_from=' + encodeURIComponent(String(q.date_from)));
            }
            if (q.date_to) {
                params.push('date_to=' + encodeURIComponent(String(q.date_to)));
            }
            var suffix = params.length ? ('?' + params.join('&')) : '';
            return getJson('/api/admin/audit-events' + suffix);
        }),

        admin_validate_ai_provider: callbackWrapper(function (payload) {
            var input = payload || {};
            return postJson('/api/admin/validate-ai-provider', {
                provider: input.provider || '',
                model: input.model || '',
                api_key: input.api_key || '',
                ollama_host: input.ollama_host || ''
            });
        }),

        get_runtime_telemetry: callbackWrapper(function () {
            return getJson('/api/runtime-telemetry');
        }),

        reset_runtime_telemetry: callbackWrapper(function () {
            return postJson('/api/runtime-telemetry/reset', {});
        }),

        reset_session: callbackWrapper(function () {
            return postJson('/api/reset-session', {});
        })
    };

    Object.keys(bridgeApi).forEach(function (key) {
        eelObj[key] = bridgeApi[key];
    });

    window.eel = eelObj;

    window.__MANUSCRIPT_WEB_MODE__ = true;
}());
